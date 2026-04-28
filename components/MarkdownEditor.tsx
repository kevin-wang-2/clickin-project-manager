"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { match as pinyinMatch } from "pinyin-pro";
import { createPortal } from "react-dom";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import type { MentionMember } from "./MentionTextarea";

// ─── Toolbar ──────────────────────────────────────────────────────────────────

type TiptapEditor = ReturnType<typeof useEditor>;

function ToolbarBtn({
  onClick, active, title, children,
}: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
        active
          ? "bg-zinc-800 text-white"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: TiptapEditor | null }) {
  if (!editor) return null;
  return (
    <div className="flex flex-wrap gap-0.5 px-2 py-1.5 border-b border-zinc-100">
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")} title="粗体 (⌘B)">
        <strong>B</strong>
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")} title="斜体 (⌘I)">
        <em>I</em>
      </ToolbarBtn>
      <span className="w-px bg-zinc-200 mx-1 self-stretch" />
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })} title="二级标题">
        H2
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })} title="三级标题">
        H3
      </ToolbarBtn>
      <span className="w-px bg-zinc-200 mx-1 self-stretch" />
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")} title="无序列表">
        ≡
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")} title="有序列表">
        1.
      </ToolbarBtn>
      <span className="w-px bg-zinc-200 mx-1 self-stretch" />
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")} title="引用">
        "
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")} title="行内代码">
        {"</>"}
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")} title="代码块">
        {"{ }"}
      </ToolbarBtn>
    </div>
  );
}

// ─── Mention dropdown ─────────────────────────────────────────────────────────

type SuggestionState = {
  items: MentionMember[];
  idx: number;
  rect: DOMRect;
  command: (m: MentionMember) => void;
} | null;

// ─── Editor ──────────────────────────────────────────────────────────────────

export default function MarkdownEditor({
  content,
  onChange,
  onMentionsChange,
  members,
  placeholder = "写内容…",
  minHeight = 200,
}: {
  content: string;
  onChange: (md: string) => void;
  onMentionsChange: (m: MentionMember[]) => void;
  members: MentionMember[];
  placeholder?: string;
  minHeight?: number;
}) {
  const [sugg, setSugg] = useState<SuggestionState>(null);

  // Keep mutable refs to avoid stale closures in Tiptap callbacks
  const membersRef = useRef(members);
  membersRef.current = members;
  const suggRef = useRef<SuggestionState>(null);
  suggRef.current = sugg;
  const setSuggRef = useRef(setSugg);
  setSuggRef.current = setSugg;

  // Keyboard handler forwarded from Tiptap's onKeyDown suggestion callback
  const keyHandlerRef = useRef<((e: KeyboardEvent) => boolean) | null>(null);

  const extensions = useMemo(() => [
    StarterKit,
    Markdown.configure({ transformCopiedText: true }),
    Placeholder.configure({ placeholder }),
    Mention.configure({
      HTMLAttributes: { class: "text-blue-500 font-medium" },
      suggestion: {
        char: "@",
        items: ({ query }: { query: string }) => {
          const m = membersRef.current;
          if (!query) return m.slice(0, 6);
          return m.filter(x =>
            x.name.includes(query) || pinyinMatch(x.name, query.toLowerCase()) != null
          ).slice(0, 6);
        },
        render: () => ({
          onStart: (props: { items: MentionMember[]; clientRect?: (() => DOMRect | null) | null; command: (attrs: { id: string; label: string }) => void }) => {
            const rect = props.clientRect?.();
            if (!rect) return;
            setSuggRef.current({
              items: props.items,
              idx: 0,
              rect,
              command: (m) => props.command({ id: m.openId, label: m.name }),
            });
          },
          onUpdate: (props: { items: MentionMember[]; clientRect?: (() => DOMRect | null) | null; command: (attrs: { id: string; label: string }) => void }) => {
            const rect = props.clientRect?.();
            setSuggRef.current(prev => prev && rect ? {
              ...prev,
              items: props.items,
              rect,
              command: (m) => props.command({ id: m.openId, label: m.name }),
            } : null);
          },
          onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            return keyHandlerRef.current?.(event) ?? false;
          },
          onExit: () => setSuggRef.current(null),
        }),
      },
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []); // created once; members accessed via ref

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content,
    editorProps: {
      attributes: {
        class: "prose prose-zinc max-w-none focus:outline-none px-3 py-2",
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
      onChange(md);

      // Extract mention nodes from the document
      const mentioned: MentionMember[] = [];
      const seen = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function traverse(node: any) {
        if (node.type === "mention" && node.attrs?.id && !seen.has(node.attrs.id)) {
          seen.add(node.attrs.id);
          mentioned.push({ openId: node.attrs.id, name: node.attrs.label ?? node.attrs.id });
        }
        node.content?.forEach(traverse);
      }
      editor.getJSON().content?.forEach(traverse);
      onMentionsChange(mentioned);
    },
  });

  // Wire up keyboard handler with fresh state each render
  const handleSuggKey = useCallback((event: KeyboardEvent): boolean => {
    const s = suggRef.current;
    if (!s || s.items.length === 0) return false;
    if (event.key === "ArrowDown") {
      setSuggRef.current(prev => prev ? { ...prev, idx: Math.min(prev.idx + 1, prev.items.length - 1) } : null);
      return true;
    }
    if (event.key === "ArrowUp") {
      setSuggRef.current(prev => prev ? { ...prev, idx: Math.max(prev.idx - 1, 0) } : null);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const item = s.items[s.idx];
      if (item) { s.command(item); setSuggRef.current(null); }
      return true;
    }
    if (event.key === "Escape") {
      setSuggRef.current(null);
      return true;
    }
    return false;
  }, []);

  useEffect(() => { keyHandlerRef.current = handleSuggKey; }, [handleSuggKey]);

  return (
    <div className="rounded-lg border border-zinc-200 focus-within:border-zinc-400 overflow-hidden bg-white">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      {sugg && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed",
            left: sugg.rect.left,
            top: sugg.rect.bottom + 4,
            zIndex: 9999,
          }}
          className="bg-white rounded-xl shadow-lg border border-zinc-100 py-1 min-w-[140px]"
        >
          {sugg.items.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zinc-400">无匹配成员</p>
          ) : sugg.items.map((m, i) => (
            <button
              key={m.openId}
              onMouseDown={e => { e.preventDefault(); sugg.command(m); setSugg(null); }}
              className={`w-full text-left px-3 py-2 text-sm ${
                i === sugg.idx ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
