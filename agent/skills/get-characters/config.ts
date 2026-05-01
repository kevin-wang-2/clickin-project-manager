import type { SkillConfig } from "../_types";

export const config: SkillConfig = {
  name: "get_characters",
  description: `获取当前 production 的全部角色列表，包含姓名、角色类型、性别、人物简介，以及合并角色（aggregate）的成员构成和出现的台词块数量。
需要已聚焦的 production context。`,
  enabled: true,
  mode: "sync",
  params: [],
  pendingMessage: "正在读取角色列表…",
  constrain: (r) => ({ ...r, wait_reply: false }),
};
