"use client";

import { useState } from "react";

// ── Plugin type ───────────────────────────────────────────────────────────────

export type InlinePlugin = {
  // Regex source string (no flags); used in a combined split pattern.
  // If the pattern contains capturing groups they are flattened — keep it to zero
  // or exactly one outer group around the whole pattern.
  pattern: string;
  render: (match: string, key: string) => React.ReactNode;
};

// ── Script-ref chip ───────────────────────────────────────────────────────────

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

// ── Built-in plugins ──────────────────────────────────────────────────────────

export const scriptRefTextPlugin: InlinePlugin = {
  pattern: String.raw`\[#[^\]\n]*\]\([^\s)"]+(?:\s+"[^"]*")?\)`,
  render: (match, key) => {
    const m = match.match(/^\[#([^\]]*)\]\(([^\s)"]+)(?:\s+"([^"]*)")?\)$/);
    if (!m) return match;
    const [, label, href, title] = m;
    return <ScriptChip key={key} label={label} href={href} title={title} />;
  },
};

export function memberTextPlugin(mentions: { name: string }[]): InlinePlugin {
  if (!mentions.length) {
    // pattern that never matches
    return { pattern: "(?!x)x", render: (m) => m };
  }
  const escaped = mentions
    .map((m) => m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return {
    pattern: `@(?:${escaped})`,
    render: (match, key) => (
      <span key={key} className="font-medium text-blue-500">{match}</span>
    ),
  };
}

// ── Core renderer ─────────────────────────────────────────────────────────────

// Applies plugin patterns to a single line of text (no newlines expected).
// Returns an array of React nodes.
function renderSegments(text: string, plugins: InlinePlugin[], keyBase: string): React.ReactNode[] {
  if (!plugins.length || !text) return text ? [text] : [];

  const n = plugins.length;
  // Each plugin contributes one capturing group in the combined pattern.
  const combined = new RegExp(plugins.map((p) => `(${p.pattern})`).join("|"));
  const parts = text.split(combined);

  // split with n capturing groups produces runs of (n+1) elements:
  //   parts[i*(n+1)+0]   = plain text before
  //   parts[i*(n+1)+1..n] = exactly one is non-undefined (the matching group)
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i += n + 1) {
    const plain = parts[i];
    if (plain) nodes.push(plain);

    for (let pi = 0; pi < n; pi++) {
      const match = parts[i + 1 + pi];
      if (match != null && match !== "") {
        nodes.push(plugins[pi].render(match, `${keyBase}-${i}-${pi}`));
        break;
      }
    }
  }
  return nodes;
}

// ── SmartText ─────────────────────────────────────────────────────────────────

export default function SmartText({
  content,
  plugins = [],
  className,
}: {
  content: string;
  plugins?: InlinePlugin[];
  className?: string;
}) {
  if (!content) return null;

  // Split only on bare newlines (not inside link titles — plugin patterns match
  // those first before we reach the plain-text splitter).
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, li) => {
    if (li > 0) nodes.push(<br key={`br-${li}`} />);
    nodes.push(...renderSegments(line, plugins, `${li}`));
  });

  return (
    <span className={`text-sm break-words ${className ?? ""}`}>
      {nodes}
    </span>
  );
}
