import type { SkillModule } from "../_types";
import type { BotContext } from "../../types";
import { config } from "./config";
import { getScriptMeta } from "../../db-script";

const LAYOUT_LABELS: Record<string, string> = {
  "a4":          "A4",
  "letter":      "Letter",
  "a3-2col":     "A3（双栏）",
  "tablet-2col": "平板横屏（双栏）",
};

export const getScriptMetaSkill: SkillModule<void> = {
  config,
  async run(ctx: BotContext): Promise<string> {
    const productionId = ctx.productionContext?.productionId;
    if (!productionId) return "❌ 未设置当前 production，请先调用 focus_production。";

    const meta = await getScriptMeta(productionId);
    if (!meta) return "❌ 未找到对应的 production。";

    const layoutLabel = LAYOUT_LABELS[meta.pageLayout] ?? meta.pageLayout;
    const lines: string[] = [
      `剧本元信息 — 《${meta.productionName}》`,
      `布局：${layoutLabel}  |  舞台提示括号：${meta.stageDelimOpen}${meta.stageDelimClose}`,
      `总页数：${meta.totalPages}  |  总行数：${meta.totalBlocks}  |  场景：${meta.totalScenes} 个  |  角色：${meta.totalCharacters} 个`,
    ];

    return lines.join("\n");
  },
};
