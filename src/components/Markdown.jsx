// 极简 Markdown 渲染器：只处理摘要里会用到的 ## 标题、- 列表、**加粗**。
// 避免引入额外依赖，保证移动端打包体积小、渲染可靠。
import React from "react";

function renderInline(text, keyPrefix) {
  // 处理 **加粗**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={`${keyPrefix}-b-${i}`} className="text-white font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={`${keyPrefix}-t-${i}`}>{part}</React.Fragment>;
  });
}

export default function Markdown({ text }) {
  const lines = (text || "").split("\n");
  const blocks = [];
  let listBuffer = [];

  const flushList = (key) => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${key}`} className="space-y-1.5 mb-3 mt-1">
        {listBuffer.map((item, i) => (
          <li key={i} className="flex gap-2 text-zinc-200 leading-relaxed">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>{renderInline(item, `li-${key}-${i}`)}</span>
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (/^#{1,3}\s+/.test(line)) {
      flushList(idx);
      const title = line.replace(/^#{1,3}\s+/, "");
      blocks.push(
        <h3
          key={`h-${idx}`}
          className="mt-4 mb-1 flex items-center gap-2 text-base font-bold text-accent-soft"
        >
          <span className="h-4 w-1 rounded-full bg-accent" />
          {title}
        </h3>
      );
    } else if (/^\s*[-*]\s+/.test(line)) {
      listBuffer.push(line.replace(/^\s*[-*]\s+/, ""));
    } else if (line.trim() === "") {
      flushList(idx);
    } else {
      flushList(idx);
      blocks.push(
        <p key={`p-${idx}`} className="mb-2 text-zinc-200 leading-relaxed">
          {renderInline(line, `p-${idx}`)}
        </p>
      );
    }
  });
  flushList("end");

  return <div className="text-[15px]">{blocks}</div>;
}
