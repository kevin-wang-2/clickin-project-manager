import type { SkillConfig } from "../_types";

export const config: SkillConfig = {
  name: "get_script_meta",
  description: `获取当前 production 的剧本总览元信息：布局、舞台提示符号、总行数、总页数、场景数、角色数，以及各页的行号范围（pagemap）。
适合在回答涉及剧本整体结构或页码分布的问题前调用，无需任何参数。需要已聚焦的 production context。`,
  enabled: true,
  mode: "sync",
  params: [],
  pendingMessage: "正在读取剧本元信息…",
  constrain: (r) => ({ ...r, wait_reply: false }),
};
