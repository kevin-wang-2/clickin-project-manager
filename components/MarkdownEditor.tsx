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
import { BASE_PATH } from "@/lib/base-path";
import type { ScriptBlockSearchResult } from "@/app/api/production/[id]/script/block-search/route";

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

// ─── Mention dropdown (people @) ──────────────────────────────────────────────

type SuggestionState = {
  items: MentionMember[];
  idx: number;
  rect: DOMRect;
  command: (m: MentionMember) => void;
} | null;

// ─── Script-ref dropdown (#) ──────────────────────────────────────────────────

type ScriptSuggState = {
  items: ScriptBlockSearchResult[];
  idx: number;
  rect: DOMRect;
  command: (r: ScriptBlockSearchResult) => void;
} | null;

// ─── Editor ──────────────────────────────────────────────────────────────────

export default function MarkdownEditor({
  content,
  onChange = () => {},
  onMentionsChange = () => {},
  members = [],
  productionId,
  placeholder = "写内容…",
  minHeight = 200,
  readOnly = false,
}: {
  content: string;
  onChange?: (md: string) => void;
  onMentionsChange?: (m: MentionMember[]) => void;
  members?: MentionMember[];
  productionId?: string;
  placeholder?: string;
  minHeight?: number;
  readOnly?: boolean;
}) {
  const [sugg, setSugg] = useState<SuggestionState>(null);
  const [scriptSugg, setScriptSugg] = useState<ScriptSuggState>(null);
  const [scriptTooltip, setScriptTooltip] = useState<{ text: string; rect: DOMRect } | null>(null);

  // Keep mutable refs to avoid stale closures in Tiptap callbacks
  const membersRef = useRef(members);
  membersRef.current = members;
  const productionIdRef = useRef(productionId);
  productionIdRef.current = productionId;
  const suggRef = useRef<SuggestionState>(null);
  suggRef.current = sugg;
  const setSuggRef = useRef(setSugg);
  setSuggRef.current = setSugg;
  const scriptSuggRef = useRef<ScriptSuggState>(null);
  scriptSuggRef.current = scriptSugg;
  const setScriptSuggRef = useRef(setScriptSugg);
  setScriptSuggRef.current = setScriptSugg;

  // Keyboard handler forwarded from Tiptap's onKeyDown suggestion callback
  const keyHandlerRef = useRef<((e: KeyboardEvent) => boolean) | null>(null);
  const scriptKeyHandlerRef = useRef<((e: KeyboardEvent) => boolean) | null>(null);

  const extensions = useMemo(() => {
    const exts = [
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
    ];

    // Only add script-ref suggestion when productionId is provided
    if (productionIdRef.current) {
      const ScriptMention = Mention.extend({
        name: "scriptMention",
        addAttributes() {
          return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(this.parent as any)?.(),
            title: {
              default: null,
              parseHTML: (el: Element) => el.getAttribute("data-title"),
              renderHTML: (attrs: { title?: string }) =>
                attrs.title ? { "data-title": attrs.title } : {},
            },
          };
        },
        // Match both our rendered span AND markdown-it rendered <a> links
        parseHTML() {
          return [
            { tag: "span[data-script-mention]" },
            {
              tag: "a",
              priority: 1001, // above Link mark's default priority
              getAttrs(el) {
                if (typeof el === "string") return false;
                const text = el.textContent ?? "";
                const href = el.getAttribute("href") ?? "";
                if (!text.startsWith("#") || !href || href.startsWith("http")) return false;
                return {
                  id: href,
                  label: text.slice(1),
                  title: el.getAttribute("title") ?? null,
                };
              },
            },
          ];
        },
        addStorage() {
          return {
            markdown: {
              serialize(state: { write: (s: string) => void }, node: { attrs: { id: string; label: string; title?: string } }) {
                const t = node.attrs.title;
                const titlePart = t ? ` "${t.replace(/"/g, "'")}"` : "";
                state.write(`[#${node.attrs.label}](${node.attrs.id}${titlePart})`);
              },
            },
          };
        },
      });

      exts.push(
        ScriptMention.configure({
          HTMLAttributes: {
            class: "inline-flex items-center px-1 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-50 text-amber-700 border border-amber-200 cursor-default",
          },
          renderHTML({ options, node }) {
            return [
              "span",
              {
                ...options.HTMLAttributes,
                "data-script-mention": node.attrs.id,
                "data-id": node.attrs.id,
                "data-label": node.attrs.label,
                ...(node.attrs.title ? { "data-title": node.attrs.title, "data-tooltip": node.attrs.title } : {}),
              },
              `#${node.attrs.label}`,
            ];
          },
          suggestion: {
            char: "#",
            allowSpaces: false,
            items: async ({ query }: { query: string }) => {
              const pid = productionIdRef.current;
              if (!pid || !query) return [];
              try {
                const res = await fetch(
                  `${BASE_PATH}/api/production/${pid}/script/block-search?q=${encodeURIComponent(query)}`
                );
                const data = await res.json() as { results?: ScriptBlockSearchResult[] };
                return data.results ?? [];
              } catch {
                return [];
              }
            },
            render: () => ({
              onStart: (props: { items: ScriptBlockSearchResult[]; clientRect?: (() => DOMRect | null) | null; command: (attrs: { id: string; label: string }) => void }) => {
                const rect = props.clientRect?.();
                if (!rect) return;
                setScriptSuggRef.current({
                  items: props.items,
                  idx: 0,
                  rect,
                  command: (r) => (props.command as (attrs: { id: string; label: string; title?: string }) => void)({
                    id: `${BASE_PATH}/production/${productionIdRef.current}/script#block-${r.blockId}`,
                    label: r.label,
                    title: r.description,
                  }),
                });
              },
              onUpdate: (props: { items: ScriptBlockSearchResult[]; clientRect?: (() => DOMRect | null) | null; command: (attrs: { id: string; label: string }) => void }) => {
                const rect = props.clientRect?.();
                setScriptSuggRef.current(prev => prev && rect ? {
                  ...prev,
                  items: props.items,
                  rect,
                  command: (r) => (props.command as (attrs: { id: string; label: string; title?: string }) => void)({
                    id: `${BASE_PATH}/production/${productionIdRef.current}/script#block-${r.blockId}`,
                    label: r.label,
                    title: r.description,
                  }),
                } : null);
              },
              onKeyDown: ({ event }: { event: KeyboardEvent }) => {
                return scriptKeyHandlerRef.current?.(event) ?? false;
              },
              onExit: () => setScriptSuggRef.current(null),
            }),
          },
        })
      );
    }

    return exts;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // created once; members/productionId accessed via ref

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions,
    content,
    editorProps: {
      attributes: {
        class: "prose prose-zinc max-w-none focus:outline-none px-3 py-2",
        style: readOnly ? "" : `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor }) => {
      if (readOnly) return;
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

  // Wire up keyboard handlers
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

  const handleScriptSuggKey = useCallback((event: KeyboardEvent): boolean => {
    const s = scriptSuggRef.current;
    if (!s || s.items.length === 0) return false;
    if (event.key === "ArrowDown") {
      setScriptSuggRef.current(prev => prev ? { ...prev, idx: Math.min(prev.idx + 1, prev.items.length - 1) } : null);
      return true;
    }
    if (event.key === "ArrowUp") {
      setScriptSuggRef.current(prev => prev ? { ...prev, idx: Math.max(prev.idx - 1, 0) } : null);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const item = s.items[s.idx];
      if (item) { s.command(item); setScriptSuggRef.current(null); }
      return true;
    }
    if (event.key === "Escape") {
      setScriptSuggRef.current(null);
      return true;
    }
    return false;
  }, []);

  useEffect(() => { keyHandlerRef.current = handleSuggKey; }, [handleSuggKey]);
  useEffect(() => { scriptKeyHandlerRef.current = handleScriptSuggKey; }, [handleScriptSuggKey]);

  return (
    <div
      className={readOnly
        ? "overflow-hidden"
        : "rounded-lg border border-zinc-200 focus-within:border-zinc-400 overflow-hidden bg-white"}
      onMouseOver={e => {
        const el = (e.target as HTMLElement).closest("[data-tooltip]");
        const text = el?.getAttribute("data-tooltip") ?? null;
        if (text) {
          setScriptTooltip({ text, rect: el!.getBoundingClientRect() });
        } else {
          setScriptTooltip(null);
        }
      }}
      onMouseLeave={() => setScriptTooltip(null)}
    >
      {!readOnly && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />

      {/* Script mention tooltip */}
      {scriptTooltip && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed",
            left: scriptTooltip.rect.left,
            top: scriptTooltip.rect.top - 8,
            transform: "translateY(-100%)",
            zIndex: 10000,
          }}
          className="bg-zinc-900 text-white text-xs px-2 py-1.5 rounded-lg pointer-events-none whitespace-pre leading-relaxed"
        >
          {scriptTooltip.text}
        </div>,
        document.body,
      )}

      {/* People mention dropdown */}
      {sugg && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed",
            left: sugg.rect.left,
            top: sugg.rect.bottom + 4,
            zIndex: 9999,
          }}
          className="bg-white rounded-xl shadow-lg border border-zinc-100 py-1 min-w-[140px] max-h-48 overflow-y-auto"
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

      {/* Script mention dropdown */}
      {scriptSugg && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed",
            left: scriptSugg.rect.left,
            top: scriptSugg.rect.bottom + 4,
            zIndex: 9999,
          }}
          className="bg-white rounded-xl shadow-lg border border-zinc-100 py-1 min-w-[220px] max-w-[360px] max-h-64 overflow-y-auto"
        >
          {scriptSugg.items.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zinc-400">无匹配内容</p>
          ) : scriptSugg.items.map((r, i) => (
            <button
              key={`${r.blockId}-${i}`}
              onMouseDown={e => { e.preventDefault(); scriptSugg.command(r); setScriptSugg(null); }}
              className={`w-full text-left px-3 py-2 ${
                i === scriptSugg.idx ? "bg-amber-50" : "hover:bg-zinc-50"
              }`}
            >
              <span className="font-mono text-sm font-semibold text-amber-700">#{r.label}</span>
              {r.description && (
                <span className="ml-2 text-xs text-zinc-400 truncate max-w-[200px] inline-block align-bottom overflow-hidden">{r.description}</span>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
