// AI 会议摘要 —— 调用 Claude (Anthropic) 官方 SDK
//
// 在纯前端 (浏览器) 中直连 Anthropic API 需要 dangerouslyAllowBrowser: true，
// 这会把 API Key 暴露在客户端。本工具是单机/个人移动场景，与 Soniox Key 一样
// 存在 LocalStorage 中，由用户自行承担密钥安全；生产环境建议改为自有后端代理。

import Anthropic from "@anthropic-ai/sdk";

const SUMMARY_MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `你是一位专业的中文会议纪要助理。用户会给你一段实时语音转写的会议逐字稿（可能包含说话人标签、口语化表达、少量识别错误）。

请仔细阅读全文，提炼出结构化的会议摘要，严格使用以下三个板块、Markdown 格式输出，不要添加任何额外说明或开场白：

## 核心议题
用 3-6 条要点概括本次会议讨论的主要话题与背景。

## 关键决定
列出会议中达成的明确结论、共识或拍板的事项；若没有则写“（本次会议未形成明确决定）”。

## 待办事项
以清单形式列出后续行动项，尽量写明 负责人 / 事项 / 截止时间（若逐字稿中有提到）；格式如：
- [负责人] 具体事项（截止：时间）

要求：忠于原文、不要编造内容、合并重复信息、过滤无意义的口水话。`;

/**
 * 流式生成会议摘要。返回一个异步生成器，逐段 yield 文本增量。
 * @param {string} apiKey      Anthropic API Key
 * @param {string} transcript  会议逐字稿全文
 */
export async function* streamSummary(apiKey, transcript) {
  if (!apiKey) {
    throw new Error("缺少 Anthropic API Key，请在设置中填写以使用 AI 摘要。");
  }
  if (!transcript || !transcript.trim()) {
    throw new Error("逐字稿为空，请先完成一次录音转写。");
  }

  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const stream = client.messages.stream({
    model: SUMMARY_MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `以下是会议逐字稿，请生成会议摘要：\n\n${transcript}`,
      },
    ],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}
