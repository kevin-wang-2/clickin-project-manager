import type { SkillConfig } from "../_types";

export const config: SkillConfig = {
  name: "get_scenes",
  description: `获取当前 production 的全部章节（场景）列表，包含编号、名称、层级关系、剧情梗概、舞台注记、预计时长及包含的台词块数量。
需要已聚焦的 production context。`,
  enabled: true,
  mode: "sync",
  params: [],
  pendingMessage: "正在读取章节列表…",
  constrain: (r) => ({ ...r, wait_reply: false }),
};
