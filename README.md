# Soniox Mobile Scribe · 手机端实时会议转写与 AI 摘要

一个**专为手机浏览器**打造的单页 Web 应用（React + Tailwind CSS + lucide-react）。
利用手机麦克风对接 **Soniox 实时流式转写 API**，实现高精度、低延迟的实时逐字稿，
并可一键调用 **Claude** 生成结构化会议摘要。

## ✨ 功能特性

- 🎙️ **一键录音**：巨大的圆形录音按钮，单手大拇指即可操作；录音时变红色停止图标并带波纹动画。
- ⚡ **实时刷字**：对接 Soniox `wss://stt-rt.soniox.com`，文字像打字机一样实时滚动刷出并自动锁定到底部。
- 🗣️ **说话人识别 + 自动标点**：默认开启 Diarization 与自动断句，不同说话人用不同颜色标签区分。
- 🤖 **AI 会议摘要**：录音结束后一键调用 Claude，自动提炼「核心议题 / 关键决定 / 待办事项」三大板块（流式输出）。
- 📋 **一键复制 / 分享**：复制全文或调用系统分享面板，直接发到微信、钉钉等。
- 📱 **移动端优化**：深色商务风、超大点击区、锁定缩放、禁用双击放大与侧滑返回，避免误触打断录音。
- 🔒 **本地存储**：Soniox / Anthropic API Key 仅保存在浏览器 LocalStorage。

## 🚀 快速开始

```bash
npm install
npm run dev        # 开发服务器 (默认监听 0.0.0.0:5173，手机同一局域网可直接访问)
npm run build      # 生产构建
npm run preview    # 预览构建产物
```

> ⚠️ 浏览器麦克风（`getUserMedia`）要求 **HTTPS** 或 `localhost`。
> 用真机测试时，请通过 HTTPS 部署，或使用 `localhost` / 内网穿透工具。

## 🔑 配置 API Key

打开应用后点击右上角 **齿轮图标**：

1. **Soniox API Key**（必填）：用于实时转写。前往 [soniox.com](https://soniox.com) 获取。
2. **Anthropic API Key**（选填）：用于 AI 摘要，格式 `sk-ant-...`。

## 🧱 技术栈

| 模块 | 说明 |
| --- | --- |
| 实时转写 | Soniox Real-time WebSocket API（`stt-rt-preview` 模型，`audio_format: "auto"`） |
| 音频采集 | HTML5 `MediaRecorder`，250ms 切片，自动适配 webm/opus（Android）与 mp4/aac（iOS） |
| AI 摘要 | `@anthropic-ai/sdk`，模型 `claude-opus-4-8`，浏览器流式输出 |
| UI | React 18 + Tailwind CSS 3 + lucide-react |
| 构建 | Vite 5 |

## 📂 目录结构

```
src/
├── App.jsx                  # 主界面：状态栏 / 录音按钮 / 标签页 / 操作栏
├── lib/
│   ├── sonioxClient.js      # Soniox WebSocket 转写客户端 + 说话人分段
│   └── summarize.js         # Claude 摘要（流式生成器）
└── components/
    ├── SettingsModal.jsx    # API Key 设置弹窗
    └── Markdown.jsx         # 极简 Markdown 渲染器
```

## ⚠️ 安全说明

本应用为**个人/单机移动场景**，API Key 直接在浏览器端使用（Anthropic SDK 需开启
`dangerouslyAllowBrowser`）。这会把密钥暴露在客户端。若用于生产或多用户环境，
强烈建议改为「自有后端代理」转发请求，不要在前端直连。
