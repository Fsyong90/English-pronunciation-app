// Soniox 实时流式转写客户端
// 文档: https://soniox.com/docs/speech-to-text/real-time/websocket
//
// 工作流程:
//   1. 建立 WebSocket 连接到 wss://stt-rt.soniox.com/transcribe-websocket
//   2. 第一条消息发送 JSON 配置 (包含 api_key、模型、说话人识别等)
//   3. 持续把麦克风音频切片 (二进制) 发送给服务器
//   4. 服务器实时回传 { tokens: [...] }，token 含 text / speaker / is_final
//   5. 停止时发送空字符串 "" 通知结束，服务器 flush 后回传 finished:true 并关闭

const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
const REALTIME_MODEL = "stt-rt-preview";

// 按优先级挑选手机浏览器支持的录音格式。
// Android Chrome 通常支持 webm/opus；iOS Safari (14.3+) 仅支持 mp4/aac。
// Soniox 的 audio_format: "auto" 会自动识别这些容器格式。
function pickMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/aac",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export class SonioxTranscriber {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey               Soniox API Key
   * @param {(state) => void} opts.onTranscript 转写状态回调 { finalText, interimText, speakers }
   * @param {(status) => void} opts.onStatus    状态回调: 'connecting' | 'recording' | 'stopped' | 'error'
   * @param {(msg) => void} opts.onError        错误回调
   */
  constructor({ apiKey, onTranscript, onStatus, onError }) {
    this.apiKey = apiKey;
    this.onTranscript = onTranscript || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onError = onError || (() => {});

    this.ws = null;
    this.mediaRecorder = null;
    this.stream = null;
    this.finalTokens = []; // 已确认 (is_final) 的 token
    this.stopping = false;
  }

  async start() {
    if (!this.apiKey) {
      this.onError("缺少 Soniox API Key，请点击右上角齿轮设置。");
      this.onStatus("error");
      return;
    }

    this.onStatus("connecting");
    this.finalTokens = [];
    this.stopping = false;

    // 1) 申请麦克风权限
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      this.onError("无法访问麦克风：" + (err?.message || err));
      this.onStatus("error");
      return;
    }

    const mimeType = pickMimeType();

    // 2) 建立 WebSocket
    try {
      this.ws = new WebSocket(SONIOX_WS_URL);
    } catch (err) {
      this.onError("无法连接 Soniox：" + (err?.message || err));
      this.onStatus("error");
      this._cleanupStream();
      return;
    }

    this.ws.onopen = () => {
      // 3) 首条消息：发送配置
      const config = {
        api_key: this.apiKey,
        model: REALTIME_MODEL,
        audio_format: "auto",
        enable_speaker_diarization: true, // 说话人识别
        enable_endpoint_detection: true, // 自动断句
        language_hints: ["zh", "en"], // 中英混合提示
      };
      this.ws.send(JSON.stringify(config));
      this._startRecording(mimeType);
      this.onStatus("recording");
    };

    this.ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.error_code || data.error_message) {
        this.onError(
          `Soniox 错误 (${data.error_code || ""}): ${data.error_message || "未知错误"}`
        );
        this.onStatus("error");
        this.stop();
        return;
      }

      if (Array.isArray(data.tokens) && data.tokens.length > 0) {
        const interim = [];
        for (const tok of data.tokens) {
          if (!tok.text) continue;
          if (tok.is_final) {
            this.finalTokens.push(tok);
          } else {
            interim.push(tok);
          }
        }
        this._emit(interim);
      }

      if (data.finished) {
        this._finishClose();
      }
    };

    this.ws.onerror = () => {
      if (!this.stopping) {
        this.onError("Soniox 连接出错，请检查网络或 API Key。");
        this.onStatus("error");
      }
    };

    this.ws.onclose = () => {
      this._cleanupStream();
      if (!this.stopping) this.onStatus("stopped");
    };
  }

  _startRecording(mimeType) {
    try {
      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.stream, { mimeType })
        : new MediaRecorder(this.stream);
    } catch (err) {
      this.onError("录音器初始化失败：" + (err?.message || err));
      this.onStatus("error");
      return;
    }

    this.mediaRecorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
        const buf = await e.data.arrayBuffer();
        this.ws.send(buf);
      }
    };

    // 每 250ms 产出一个音频切片，兼顾低延迟与切片大小
    this.mediaRecorder.start(250);
  }

  // 把当前最新状态推给 UI
  _emit(interimTokens) {
    this.onTranscript({
      finalText: tokensToText(this.finalTokens),
      interimText: tokensToText(interimTokens),
      segments: buildSpeakerSegments(this.finalTokens, interimTokens),
    });
  }

  // 用户主动停止
  stop() {
    if (this.stopping) return;
    this.stopping = true;
    this.onStatus("stopped");

    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.stop();
      }
    } catch {
      /* ignore */
    }

    // 通知 Soniox 音频结束，让其 flush 剩余 final token
    try {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send("");
        // 兜底：1.5s 内未收到 finished 就强制关闭
        setTimeout(() => this._finishClose(), 1500);
      } else {
        this._finishClose();
      }
    } catch {
      this._finishClose();
    }
  }

  _finishClose() {
    try {
      if (this.ws && this.ws.readyState <= 1) this.ws.close();
    } catch {
      /* ignore */
    }
    this._cleanupStream();
  }

  _cleanupStream() {
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    this.stream = null;
  }
}

// 把 token 数组拼接成纯文本 (token.text 已包含必要的空格与标点)
export function tokensToText(tokens) {
  return tokens.map((t) => t.text).join("");
}

// 根据 speaker 字段把 token 分组，生成带说话人标签的段落
export function buildSpeakerSegments(finalTokens, interimTokens = []) {
  const all = [
    ...finalTokens.map((t) => ({ ...t, _final: true })),
    ...interimTokens.map((t) => ({ ...t, _final: false })),
  ];

  const segments = [];
  let current = null;

  for (const tok of all) {
    if (!tok.text) continue;
    const speaker = tok.speaker != null ? String(tok.speaker) : null;
    if (!current || current.speaker !== speaker) {
      current = { speaker, text: tok.text, hasInterim: !tok._final };
      segments.push(current);
    } else {
      current.text += tok.text;
      if (!tok._final) current.hasInterim = true;
    }
  }
  return segments;
}
