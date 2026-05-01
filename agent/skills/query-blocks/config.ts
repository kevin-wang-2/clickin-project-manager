import type { SkillConfig } from "../_types";

export const config: SkillConfig = {
  name: "query_blocks",
  description: `按条件筛选剧本 block，支持按页码、类型、章节（名称或编号模糊匹配）、排练记号组合过滤，返回最多 30 条结果（含行号、页码、角色、内容）。
各筛选条件可单独或组合使用，不传则不限制该维度。需要已聚焦的 production context。`,
  enabled: true,
  mode: "sync",
  params: [
    {
      name: "page",
      type: "number",
      description: "可选。按页码过滤（1-based）",
      required: false,
    },
    {
      name: "type",
      type: "string",
      description: '可选。按类型过滤，可选值：dialogue / stage / lyric',
      required: false,
    },
    {
      name: "scene",
      type: "string",
      description: "可选。按章节过滤，模糊匹配章节名或编号（如「第一幕」或「1.2」）",
      required: false,
    },
    {
      name: "rehearsal_mark",
      type: "string",
      description: "可选。按排练记号过滤，模糊匹配（如「A」匹配「A1」、「A2」等）",
      required: false,
    },
    {
      name: "limit",
      type: "number",
      description: "可选。最多返回条数，默认 30，最大 50",
      required: false,
    },
  ],
  pendingMessage: (a) => {
    const args = a as { page?: number; type?: string; scene?: string; rehearsal_mark?: string };
    const parts: string[] = [];
    if (args?.page != null)          parts.push(`第 ${args.page} 页`);
    if (args?.type)                  parts.push(`类型：${args.type}`);
    if (args?.scene)                 parts.push(`章节含「${args.scene}」`);
    if (args?.rehearsal_mark)        parts.push(`排练记号含「${args.rehearsal_mark}」`);
    return parts.length ? `正在查询 block（${parts.join("，")}）…` : "正在查询 block…";
  },
  constrain: (r) => ({ ...r, wait_reply: false }),
};
