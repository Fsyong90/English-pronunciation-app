// Cloudflare Worker: Gemini proxy for SpeakWell.
//
// Holds the GEMINI_API_KEY as a secret so it never ships to the browser.
//
// Endpoints:
//   GET  /            -> health JSON
//   GET  /health      -> health JSON
//   POST /tts         -> { text, voice? }            -> audio/wav
//   POST /ocr         -> { image: "data:image/...;base64,..." } -> { text, detected }
//
// Configure via environment (see wrangler.toml):
//   GEMINI_API_KEY (secret, REQUIRED): wrangler secret put GEMINI_API_KEY
//   MODEL          (var): TTS model,    default "gemini-3.1-flash-tts-preview"
//   VISION_MODEL   (var): vision model, default "gemini-2.5-flash"
//   DEFAULT_VOICE  (var): default "Kore"
//   DAILY_LIMIT    (var): default "500" (shared across /tts and /ocr)
//   ALLOWED_ORIGIN (var): default "*"
//   RATE_KV        (kv binding, optional): if set, enforces DAILY_LIMIT per UTC day.

const DEFAULTS = {
  MODEL: 'gemini-3.1-flash-tts-preview',
  VISION_MODEL: 'gemini-2.5-flash',
  DEFAULT_VOICE: 'Kore',
  DAILY_LIMIT: 500,
  MAX_TEXT: 1000,
  MAX_IMAGE_BASE64: 7_000_000, // ~5 MB image after decode
};

export default {
  async fetch(request, env, ctx) {
    const allowOrigin = env.ALLOWED_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }), allowOrigin);
    }

    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return cors(json({
        ok: true,
        tts_model: env.MODEL || DEFAULTS.MODEL,
        vision_model: env.VISION_MODEL || DEFAULTS.VISION_MODEL,
      }), allowOrigin);
    }

    if (request.method !== 'POST') {
      return cors(json({ error: 'method_not_allowed' }, 405), allowOrigin);
    }
    if (!env.GEMINI_API_KEY) {
      return cors(json({ error: 'server_not_configured' }, 500), allowOrigin);
    }

    if (url.pathname === '/tts') return handleTts(request, env, ctx, allowOrigin);
    if (url.pathname === '/ocr') return handleOcr(request, env, ctx, allowOrigin);
    return cors(json({ error: 'not_found' }, 404), allowOrigin);
  },
};

async function handleTts(request, env, ctx, allowOrigin) {
  let body;
  try { body = await request.json(); } catch (_) { body = {}; }
  const text = (body.text || '').toString().trim();
  if (!text) return cors(json({ error: 'missing_text' }, 400), allowOrigin);
  if (text.length > DEFAULTS.MAX_TEXT) {
    return cors(json({ error: 'text_too_long', max: DEFAULTS.MAX_TEXT }, 400), allowOrigin);
  }

  const overLimit = await checkAndBumpDaily(env, ctx);
  if (overLimit) return cors(json(overLimit, 429), allowOrigin);

  const model = env.MODEL || DEFAULTS.MODEL;
  const voice = (body.voice || env.DEFAULT_VOICE || DEFAULTS.DEFAULT_VOICE).toString();
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const apiBody = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };

  const upstream = await callUpstream(apiUrl, apiBody);
  if (upstream.error) return cors(json(upstream.error, upstream.status), allowOrigin);

  const inline = upstream.data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!inline?.data) {
    return cors(json({ error: 'no_audio', detail: upstream.data?.candidates?.[0]?.finishReason || 'unknown' }, 502), allowOrigin);
  }

  const mime = inline.mimeType || 'audio/L16;codec=pcm;rate=24000';
  const sampleRate = parseInt((mime.match(/rate=(\d+)/) || [])[1] || '24000', 10);
  const pcm = base64ToBytes(inline.data);
  const wav = pcmToWav(pcm, sampleRate, 1, 16);

  const res = new Response(wav, {
    status: 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Cache-Control': 'public, max-age=86400',
      'X-Voice': voice,
      'X-Model': model,
    },
  });
  return cors(res, allowOrigin);
}

async function handleOcr(request, env, ctx, allowOrigin) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return cors(json({ error: 'unsupported_content_type', expected: 'application/json' }, 400), allowOrigin);
  }
  let body;
  try { body = await request.json(); } catch (_) { body = {}; }
  const dataUrl = (body.image || '').toString();
  const m = dataUrl.match(/^data:(image\/[a-z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return cors(json({ error: 'invalid_image', hint: 'expected data:image/...;base64,...' }, 400), allowOrigin);
  const imageMime = m[1];
  const imageB64 = m[2];
  if (imageB64.length > DEFAULTS.MAX_IMAGE_BASE64) {
    return cors(json({ error: 'image_too_large', max_base64_chars: DEFAULTS.MAX_IMAGE_BASE64 }, 400), allowOrigin);
  }

  const overLimit = await checkAndBumpDaily(env, ctx);
  if (overLimit) return cors(json(overLimit, 429), allowOrigin);

  const visionModel = env.VISION_MODEL || DEFAULTS.VISION_MODEL;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(visionModel)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  const prompt =
    'Extract the English text visible in this image. ' +
    'Return ONLY the text, exactly as it appears, preserving line breaks and capitalization. ' +
    'Do not add quotes, commentary, translations, or formatting. ' +
    'Skip non-English text. ' +
    'If no readable English text is present, reply with the single word: NONE';

  const apiBody = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: imageMime, data: imageB64 } },
      ],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1024,
    },
  };

  const upstream = await callUpstream(apiUrl, apiBody);
  if (upstream.error) return cors(json(upstream.error, upstream.status), allowOrigin);

  const text = (upstream.data?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || '').trim();
  if (!text || /^NONE$/i.test(text)) {
    return cors(json({ text: '', detected: false }), allowOrigin);
  }
  return cors(json({ text, detected: true, model: visionModel }), allowOrigin);
}

async function callUpstream(apiUrl, apiBody) {
  let upstream;
  try {
    upstream = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiBody),
    });
  } catch (e) {
    return { error: { error: 'upstream_unreachable', detail: String(e) }, status: 502 };
  }
  if (!upstream.ok) {
    const detail = await upstream.text();
    return { error: { error: 'upstream_error', status: upstream.status, detail: detail.slice(0, 500) }, status: 502 };
  }
  let data;
  try { data = await upstream.json(); }
  catch (e) { return { error: { error: 'upstream_bad_json' }, status: 502 }; }
  return { data };
}

async function checkAndBumpDaily(env, ctx) {
  if (!env.RATE_KV) return null;
  const limit = parseInt(env.DAILY_LIMIT || DEFAULTS.DAILY_LIMIT, 10);
  const today = new Date().toISOString().slice(0, 10);
  const key = `count:${today}`;
  const current = parseInt((await env.RATE_KV.get(key)) || '0', 10);
  if (current >= limit) return { error: 'daily_limit_reached', limit };
  ctx.waitUntil(env.RATE_KV.put(key, String(current + 1), { expirationTtl: 60 * 60 * 48 }));
  return null;
}

function cors(res, origin) {
  res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.set('Vary', 'Origin');
  res.headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  res.headers.set('Access-Control-Max-Age', '86400');
  return res;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Wrap raw PCM (mono, 16-bit) into a minimal WAV container so browsers can play it.
function pcmToWav(pcm, sampleRate, numChannels, bitsPerSample) {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcm);
  return buffer;
}
function writeStr(view, offset, s) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}
