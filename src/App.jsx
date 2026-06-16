import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Settings,
  Mic,
  Square,
  Copy,
  Share2,
  Sparkles,
  FileText,
  Loader2,
  Check,
  AlertCircle,
  AudioLines,
} from "lucide-react";
import { SonioxTranscriber } from "./lib/sonioxClient.js";
import { streamSummary } from "./lib/summarize.js";
import SettingsModal from "./components/SettingsModal.jsx";
import Markdown from "./components/Markdown.jsx";

const LS_SONIOX = "soniox_api_key";
const LS_ANTHROPIC = "anthropic_api_key";

const SPEAKER_COLORS = [
  "text-sky-400",
  "text-amber-400",
  "text-pink-400",
  "text-violet-400",
  "text-emerald-400",
  "text-orange-400",
];

export default function App() {
  // ----- 设置 (API Keys) -----
  const [sonioxKey, setSonioxKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setSonioxKey(localStorage.getItem(LS_SONIOX) || "");
    setAnthropicKey(localStorage.getItem(LS_ANTHROPIC) || "");
  }, []);

  const saveSettings = ({ sonioxKey: sx, anthropicKey: an }) => {
    localStorage.setItem(LS_SONIOX, sx);
    localStorage.setItem(LS_ANTHROPIC, an);
    setSonioxKey(sx);
    setAnthropicKey(an);
    setSettingsOpen(false);
    toast("设置已保存");
  };

  // ----- 录音 / 转写状态 -----
  const [status, setStatus] = useState("idle"); // idle|connecting|recording|stopped|error
  const [segments, setSegments] = useState([]); // 带说话人的段落
  const [interimText, setInterimText] = useState("");
  const [activeTab, setActiveTab] = useState("live"); // live | summary
  const transcriberRef = useRef(null);
  const liveScrollRef = useRef(null);

  // ----- AI 摘要状态 -----
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  // ----- 提示条 -----
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef(null);
  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2200);
  }, []);

  const isRecording = status === "recording" || status === "connecting";

  // 完整逐字稿（带说话人标签），用于复制 / 分享 / 摘要
  const fullTranscript = useMemo(() => {
    const multiSpeaker = new Set(segments.map((s) => s.speaker)).size > 1;
    return segments
      .map((s) => {
        const label = multiSpeaker && s.speaker ? `说话人 ${s.speaker}：` : "";
        return label + s.text.trim();
      })
      .filter(Boolean)
      .join("\n");
  }, [segments]);

  const hasTranscript = fullTranscript.trim().length > 0;

  // 实时滚动锁定到底部
  useEffect(() => {
    const el = liveScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [segments, interimText]);

  // ----- 录音控制 -----
  const startRecording = useCallback(async () => {
    if (!sonioxKey) {
      setSettingsOpen(true);
      toast("请先设置 Soniox API Key");
      return;
    }
    // 新会话：清空旧数据
    setSegments([]);
    setInterimText("");
    setSummary("");
    setSummaryError("");
    setActiveTab("live");

    const transcriber = new SonioxTranscriber({
      apiKey: sonioxKey,
      onTranscript: ({ interimText: it, segments: segs }) => {
        setSegments(segs.filter((s) => s.text.trim()));
        setInterimText(it);
      },
      onStatus: (s) => setStatus(s),
      onError: (msg) => toast(msg),
    });
    transcriberRef.current = transcriber;
    await transcriber.start();
  }, [sonioxKey, toast]);

  const stopRecording = useCallback(() => {
    transcriberRef.current?.stop();
    setInterimText("");
  }, []);

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  useEffect(() => {
    return () => transcriberRef.current?.stop();
  }, []);

  // ----- AI 摘要 -----
  const generateSummary = useCallback(async () => {
    if (!hasTranscript) {
      toast("还没有可摘要的逐字稿");
      return;
    }
    if (!anthropicKey) {
      setSettingsOpen(true);
      toast("请先设置 Anthropic API Key");
      return;
    }
    setActiveTab("summary");
    setSummary("");
    setSummaryError("");
    setSummaryLoading(true);
    try {
      for await (const chunk of streamSummary(anthropicKey, fullTranscript)) {
        setSummary((prev) => prev + chunk);
      }
    } catch (err) {
      setSummaryError(err?.message || "生成摘要失败，请检查 API Key 与网络。");
    } finally {
      setSummaryLoading(false);
    }
  }, [anthropicKey, fullTranscript, hasTranscript, toast]);

  // ----- 复制 / 分享 -----
  const currentText = activeTab === "summary" ? summary : fullTranscript;

  const copyText = async () => {
    if (!currentText.trim()) return toast("没有可复制的内容");
    try {
      await navigator.clipboard.writeText(currentText);
      toast("已复制到剪贴板");
    } catch {
      toast("复制失败，请手动选择文本");
    }
  };

  const shareText = async () => {
    if (!currentText.trim()) return toast("没有可分享的内容");
    const title = activeTab === "summary" ? "会议摘要" : "会议逐字稿";
    if (navigator.share) {
      try {
        await navigator.share({ title, text: currentText });
      } catch {
        /* 用户取消，忽略 */
      }
    } else {
      copyText();
      toast("当前环境不支持分享，已复制文本");
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-ink-950 text-zinc-100">
      {/* ===== 顶部状态栏 ===== */}
      <header className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-ink-800/70">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15">
            <AudioLines className="h-5 w-5 text-accent" />
          </div>
          <div className="leading-tight">
            <h1 className="text-[15px] font-bold tracking-tight">Soniox Mobile Scribe</h1>
            <p className="text-[11px] text-zinc-500">实时会议转写 · AI 摘要</p>
          </div>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-full bg-ink-850 active:bg-ink-700"
          aria-label="设置"
        >
          <Settings className="h-5 w-5 text-zinc-300" />
        </button>
      </header>

      {/* ===== 录音按钮区 ===== */}
      <section className="flex flex-col items-center pt-6 pb-4">
        <div className="relative grid place-items-center">
          {/* 波纹动画 */}
          {isRecording && (
            <>
              <span className="absolute h-28 w-28 rounded-full bg-red-500/30 animate-ripple" />
              <span
                className="absolute h-28 w-28 rounded-full bg-red-500/20 animate-ripple"
                style={{ animationDelay: "0.6s" }}
              />
            </>
          )}
          <button
            onClick={toggleRecording}
            className={[
              "relative grid h-28 w-28 place-items-center rounded-full transition-transform active:scale-95",
              isRecording
                ? "bg-red-500 shadow-lg shadow-red-500/30"
                : "bg-accent shadow-lg shadow-accent/30 animate-breathe",
            ].join(" ")}
            aria-label={isRecording ? "停止录音" : "开始录音"}
          >
            {status === "connecting" ? (
              <Loader2 className="h-11 w-11 animate-spin text-white" />
            ) : isRecording ? (
              <Square className="h-10 w-10 fill-white text-white" strokeWidth={1} />
            ) : (
              <Mic className="h-12 w-12 text-ink-950" />
            )}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-sm">
          <span
            className={[
              "h-2 w-2 rounded-full",
              status === "recording"
                ? "bg-red-500 animate-pulse"
                : status === "connecting"
                ? "bg-amber-400 animate-pulse"
                : status === "error"
                ? "bg-red-600"
                : "bg-zinc-600",
            ].join(" ")}
          />
          <span className="text-zinc-400">
            {status === "recording"
              ? "正在录音 · 实时转写中"
              : status === "connecting"
              ? "正在连接 Soniox…"
              : status === "error"
              ? "出错了，请检查设置"
              : hasTranscript
              ? "录音已结束"
              : "点击麦克风开始录音"}
          </span>
        </div>
      </section>

      {/* ===== 标签页切换 ===== */}
      <div className="px-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-ink-850 p-1">
          <TabButton
            active={activeTab === "live"}
            onClick={() => setActiveTab("live")}
            icon={<FileText className="h-4 w-4" />}
            label="实时逐字稿"
          />
          <TabButton
            active={activeTab === "summary"}
            onClick={() => setActiveTab("summary")}
            icon={<Sparkles className="h-4 w-4" />}
            label="AI 会议摘要"
          />
        </div>
      </div>

      {/* ===== 内容区 ===== */}
      <main className="flex-1 overflow-hidden px-4 pt-3">
        {activeTab === "live" ? (
          <div
            ref={liveScrollRef}
            className="scroll-area selectable h-full overflow-y-auto rounded-2xl bg-ink-900/60 border border-ink-800 p-4 leading-relaxed"
          >
            {!hasTranscript && !interimText ? (
              <EmptyState
                icon={<Mic className="h-8 w-8 text-zinc-600" />}
                title="还没有转写内容"
                desc="点击上方麦克风按钮，开始实时记录会议。说话人识别与自动标点已默认开启。"
              />
            ) : (
              <div className="space-y-3 pb-2">
                {segments.map((seg, i) => (
                  <SpeakerLine key={i} seg={seg} />
                ))}
                {interimText && (
                  <p className="text-zinc-500 italic caret">{interimText}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="scroll-area selectable h-full overflow-y-auto rounded-2xl bg-ink-900/60 border border-ink-800 p-4">
            {summaryError ? (
              <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{summaryError}</span>
              </div>
            ) : summary ? (
              <>
                <Markdown text={summary} />
                {summaryLoading && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在生成…
                  </div>
                )}
              </>
            ) : summaryLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-zinc-500">
                <Loader2 className="h-7 w-7 animate-spin text-accent" />
                <p className="text-sm">AI 正在提炼会议要点…</p>
              </div>
            ) : (
              <EmptyState
                icon={<Sparkles className="h-8 w-8 text-zinc-600" />}
                title="尚未生成摘要"
                desc="完成录音后，点击下方“生成摘要”，AI 会自动提炼核心议题、关键决定与待办事项。"
              />
            )}
          </div>
        )}
      </main>

      {/* ===== 底部操作栏 ===== */}
      <footer className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {activeTab === "live" ? (
          <button
            onClick={generateSummary}
            disabled={!hasTranscript || summaryLoading}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 text-base font-bold text-ink-950 active:bg-accent-soft disabled:opacity-40"
          >
            {summaryLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
            生成 AI 摘要
          </button>
        ) : (
          <button
            onClick={generateSummary}
            disabled={!hasTranscript || summaryLoading}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-ink-800 py-4 text-base font-bold text-white active:bg-ink-700 disabled:opacity-40 border border-ink-700"
          >
            <Sparkles className="h-5 w-5 text-accent" />
            重新生成摘要
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={copyText}
            className="flex items-center justify-center gap-2 rounded-xl bg-ink-850 py-3.5 text-sm font-semibold active:bg-ink-700 border border-ink-700"
          >
            <Copy className="h-4 w-4 text-zinc-300" /> 一键复制全文
          </button>
          <button
            onClick={shareText}
            className="flex items-center justify-center gap-2 rounded-xl bg-ink-850 py-3.5 text-sm font-semibold active:bg-ink-700 border border-ink-700"
          >
            <Share2 className="h-4 w-4 text-zinc-300" /> 分享 / 导出
          </button>
        </div>
      </footer>

      {/* ===== 提示条 ===== */}
      {toastMsg && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full bg-ink-700/95 px-4 py-2.5 text-sm text-white shadow-xl animate-fadeUp">
            <Check className="h-4 w-4 text-accent" />
            {toastMsg}
          </div>
        </div>
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sonioxKey={sonioxKey}
        anthropicKey={anthropicKey}
        onSave={saveSettings}
      />
    </div>
  );
}

// ----- 子组件 -----

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors",
        active ? "bg-accent text-ink-950" : "text-zinc-400 active:text-zinc-200",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function SpeakerLine({ seg }) {
  const colorIdx = seg.speaker ? (parseInt(seg.speaker, 10) - 1) % SPEAKER_COLORS.length : 0;
  const color = SPEAKER_COLORS[(colorIdx + SPEAKER_COLORS.length) % SPEAKER_COLORS.length];
  return (
    <p className="leading-relaxed">
      {seg.speaker && (
        <span className={`mr-1.5 text-xs font-bold ${color}`}>说话人 {seg.speaker}</span>
      )}
      <span className={seg.hasInterim ? "text-zinc-300" : "text-zinc-100"}>
        {seg.text}
      </span>
    </p>
  );
}

function EmptyState({ icon, title, desc }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-ink-850">{icon}</div>
      <p className="text-base font-semibold text-zinc-300">{title}</p>
      <p className="text-sm leading-relaxed text-zinc-500">{desc}</p>
    </div>
  );
}
