"use client";

import { useState } from "react";

// ── Script mention chip ───────────────────────────────────────────────────────

function ScriptChip({ label, href, title }: { label: string; href: string; title?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <span className="relative inline-block">
      <a
        href={href}
        className="inline-flex items-center px-1 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 no-underline transition-colors"
        onMouseEnter={() => title && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        #{label}
      </a>
      {hovered && title && (
        <span className="absolute bottom-full left-0 mb-1 z-50 bg-zinc-900 text-white text-xs px-2 py-1.5 rounded-lg whitespace-pre pointer-events-none leading-relaxed shadow-lg">
          {title}
        </span>
      )}
    </span>
  );
}

// ── Inline renderer ───────────────────────────────────────────────────────────

// Split pattern: HTML spans (mentions), bold, italic, strikethrough, links
const INLINE_SPLIT = /(<span[^>]*>[\s\S]*?<\/span>|\*\*[^*]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|\[[^\]\n]*\]\([^\s)"]+(?:\s+"[^"]*")?\))/g;

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const segments: string[] = text.split(INLINE_SPLIT);
  return segments.flatMap((seg, i) => {
    const key = `${keyBase}-${i}`;

    // HTML span — @mention serialized by tiptap-markdown
    if (seg.startsWith("<span")) {
      const inner = seg.replace(/<[^>]+>/g, "");
      return <span key={key} className="font-medium text-blue-500">{inner}</span>;
    }
    // Bold
    if (seg.startsWith("**") && seg.endsWith("**")) {
      return <strong key={key}>{seg.slice(2, -2)}</strong>;
    }
    // Italic
    if (seg.startsWith("*") && seg.endsWith("*")) {
      return <em key={key}>{seg.slice(1, -1)}</em>;
    }
    // Strikethrough
    if (seg.startsWith("~~") && seg.endsWith("~~")) {
      return <s key={key}>{seg.slice(2, -2)}</s>;
    }
    // Link / script mention
    if (seg.startsWith("[")) {
      const m = seg.match(/^\[([^\]]*)\]\(([^\s)"]+)(?:\s+"([^"]*)")?\)$/);
      if (m) {
        const [, linkText, href, title] = m;
        if (linkText.startsWith("#") && !href.startsWith("http")) {
          return <ScriptChip key={key} label={linkText.slice(1)} href={href} title={title} />;
        }
        return (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer"
            className="text-blue-600 underline">
            {linkText}
          </a>
        );
      }
    }
    return seg;
  });
}

// ── Block renderer ────────────────────────────────────────────────────────────

function renderBlock(block: string, idx: number): React.ReactNode {
  const lines = block.split("\n").filter(l => l.trim() !== "");
  if (lines.length === 0) return null;

  // Heading (only first line matters)
  const headMatch = lines[0].match(/^(#{1,3}) (.+)$/);
  if (headMatch) {
    const level = headMatch[1].length;
    const text = headMatch[2];
    const cls = level === 1
      ? "text-xl font-bold mt-4 mb-1"
      : level === 2
      ? "text-lg font-semibold mt-3 mb-1"
      : "text-base font-semibold mt-2 mb-0.5";
    const Tag = `h${level}` as "h1" | "h2" | "h3";
    return <Tag key={idx} className={cls}>{renderInline(text, `${idx}-h`)}</Tag>;
  }

  // Bullet list — all lines start with "- " or "* "
  if (lines.every(l => /^[*-] /.test(l))) {
    return (
      <ul key={idx} className="list-disc pl-5 my-1 space-y-0.5">
        {lines.map((l, i) => (
          <li key={i} className="text-sm">{renderInline(l.slice(2), `${idx}-ul-${i}`)}</li>
        ))}
      </ul>
    );
  }

  // Ordered list — all lines start with "N. "
  if (lines.every(l => /^\d+\. /.test(l))) {
    return (
      <ol key={idx} className="list-decimal pl-5 my-1 space-y-0.5">
        {lines.map((l, i) => (
          <li key={i} className="text-sm">{renderInline(l.replace(/^\d+\. /, ""), `${idx}-ol-${i}`)}</li>
        ))}
      </ol>
    );
  }

  // Paragraph — split only on TipTap hard breaks (\\\n), not bare newlines,
  // so that multi-line link titles don't get broken apart.
  const hardParts = block.split(/\\\n/);
  const nodes: React.ReactNode[] = [];
  hardParts.forEach((part, i) => {
    nodes.push(...renderInline(part, `${idx}-p-${i}`));
    if (i < hardParts.length - 1) nodes.push(<br key={`${idx}-br-${i}`} />);
  });

  return <p key={idx} className="text-sm my-1">{nodes}</p>;
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function MarkdownView({ content, className }: { content: string; className?: string }) {
  if (!content?.trim()) return null;
  const blocks = content.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  return (
    <div className={`text-zinc-800 ${className ?? ""}`}>
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}
