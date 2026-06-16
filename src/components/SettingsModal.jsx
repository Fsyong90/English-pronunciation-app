import React, { useEffect, useState } from "react";
import { X, KeyRound, Sparkles, Eye, EyeOff, ShieldCheck } from "lucide-react";

// 设置弹窗：录入并保存 Soniox / Anthropic API Key (LocalStorage)
export default function SettingsModal({ open, onClose, sonioxKey, anthropicKey, onSave }) {
  const [sx, setSx] = useState(sonioxKey || "");
  const [an, setAn] = useState(anthropicKey || "");
  const [showSx, setShowSx] = useState(false);
  const [showAn, setShowAn] = useState(false);

  useEffect(() => {
    if (open) {
      setSx(sonioxKey || "");
      setAn(anthropicKey || "");
    }
  }, [open, sonioxKey, anthropicKey]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fadeUp"
        onClick={onClose}
      />
      {/* 弹窗主体：底部抽屉式，适合大拇指操作 */}
      <div className="relative w-full sm:max-w-md bg-ink-850 border-t sm:border border-ink-700 rounded-t-3xl sm:rounded-3xl p-5 pb-8 animate-fadeUp shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-600 sm:hidden" />

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-accent" />
            API 设置
          </h2>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-ink-800 active:bg-ink-700"
            aria-label="关闭"
          >
            <X className="h-5 w-5 text-zinc-400" />
          </button>
        </div>

        {/* Soniox Key */}
        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-300">
          <Sparkles className="h-4 w-4 text-accent" /> Soniox API Key
          <span className="text-xs text-zinc-500">（实时转写，必填）</span>
        </label>
        <div className="relative mb-4">
          <input
            type={showSx ? "text" : "password"}
            value={sx}
            onChange={(e) => setSx(e.target.value)}
            placeholder="粘贴你的 Soniox API Key"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full rounded-xl bg-ink-900 border border-ink-700 px-4 py-3.5 pr-12 text-base text-white placeholder:text-zinc-600 outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => setShowSx((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
            aria-label="显示/隐藏"
          >
            {showSx ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>

        {/* Anthropic Key */}
        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-300">
          <Sparkles className="h-4 w-4 text-accent-soft" /> Anthropic API Key
          <span className="text-xs text-zinc-500">（AI 摘要，选填）</span>
        </label>
        <div className="relative mb-5">
          <input
            type={showAn ? "text" : "password"}
            value={an}
            onChange={(e) => setAn(e.target.value)}
            placeholder="sk-ant-..."
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full rounded-xl bg-ink-900 border border-ink-700 px-4 py-3.5 pr-12 text-base text-white placeholder:text-zinc-600 outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => setShowAn((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
            aria-label="显示/隐藏"
          >
            {showAn ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>

        <p className="mb-5 flex items-start gap-1.5 text-xs leading-relaxed text-zinc-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
          密钥仅保存在本机浏览器 (LocalStorage)，不会上传到任何第三方服务器。
        </p>

        <button
          onClick={() => onSave({ sonioxKey: sx.trim(), anthropicKey: an.trim() })}
          className="w-full rounded-xl bg-accent py-4 text-base font-bold text-ink-950 active:bg-accent-soft"
        >
          保存
        </button>
      </div>
    </div>
  );
}
