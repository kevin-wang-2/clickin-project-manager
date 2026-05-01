import type { SkillConfig } from "../_types";

export const config: SkillConfig = {
  name: "search_blocks",
  description: `在当前 production 的剧本内容中全文搜索，返回匹配的 block 列表（最多 20 条）。
每条结果包含行号、页码、block ID、类型、角色、场景名及内容。
可选指定 page 进行单页范围内搜索。需要已聚焦的 production context。`,
  enabled: true,
  mode: "sync",
  params: [
    {
      name: "query",
      type: "string",
      description: "搜索关键词，大小写不敏感，模糊匹配 block 内容",
      required: true,
    },
    {
      name: "page",
      type: "number",
      description: "可选。指定页码（1-based）时只返回该页内匹配的结果",
      required: false,
    },
  ],
  constrain: (r) => ({ ...r, wait_reply: false }),
};
