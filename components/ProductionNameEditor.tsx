"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BASE_PATH } from "@/lib/base-path";

export default function ProductionNameEditor({
  productionId, name, canEdit,
}: {
  productionId: string;
  name: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) { setEditing(false); setDraft(name); return; }
    setSaving(true);
    const res = await fetch(`${BASE_PATH}/api/production/${productionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setSaving(false);
    if (res.ok) { setEditing(false); router.refresh(); }
  }

  function cancel() { setEditing(false); setDraft(name); }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
        onBlur={save}
        disabled={saving}
        className="text-sm font-bold tracking-[0.2em] text-zinc-400 uppercase bg-transparent border-b border-zinc-300 outline-none w-40"
      />
    );
  }

  return (
    <span className="group flex items-center gap-1.5">
      <h1 className="text-sm font-bold tracking-[0.2em] text-zinc-400 uppercase">{name}</h1>
      {canEdit && (
        <button
          onClick={() => { setDraft(name); setEditing(true); }}
          className="text-zinc-300 hover:text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
          title="重命名"
        >
          ✎
        </button>
      )}
    </span>
  );
}
