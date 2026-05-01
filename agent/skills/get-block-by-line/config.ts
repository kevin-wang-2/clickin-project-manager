import type { SkillConfig } from "../_types";

export const config: SkillConfig = {
  name: "get_block_by_line",
  description: `读取剧本中指定行号（1-based）的 block 内容，返回该块的 ID、类型、角色、场景和台词/舞台提示文本。
行号对应剧本编辑器左侧显示的行号。需要已聚焦的 production context。`,
  enabled: true,
  mode: "sync",
  params: [
    {
      name: "line",
      type: "number",
      description: "目标行号，从 1 开始",
      required: true,
    },
  ],
  constrain: (r) => ({ ...r, wait_reply: false }),
};
