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
      "",
    ];

    if (meta.pageRanges.length === 0) {
      lines.push("（暂无页码数据，请等待服务端计算完成后再试）");
    } else {
      lines.push("各页行号范围：");
      for (const pr of meta.pageRanges) {
        lines.push(`  第 ${pr.pageNum} 页：行 ${pr.firstLine}–${pr.lastLine}（${pr.blockCount} 块）`);
      }
      lines.push("");
      // Compact line→page table for LLM reference
      lines.push("行号→页码对照（完整）：");
      const pairs = Object.entries(meta.lineToPage)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([ln, pg]) => `${ln}:${pg}`)
        .join(",");
      lines.push(pairs);
    }

    return lines.join("\n");
  },
};
