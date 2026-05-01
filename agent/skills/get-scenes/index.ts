import type { SkillModule } from "../_types";
import type { BotContext } from "../../types";
import type { SceneRow } from "../../db-script";
import { config } from "./config";
import { getScenesForProduction } from "../../db-script";

export const getScenesSkill: SkillModule<void> = {
  config,
  async run(ctx: BotContext): Promise<string> {
    const productionId = ctx.productionContext?.productionId;
    if (!productionId) return "❌ 未设置当前 production，请先调用 focus_production。";

    const scenes = await getScenesForProduction(productionId);
    if (scenes.length === 0) return "当前 production 尚无章节。";

    // Build id→row map for parent lookups
    const byId = new Map<string, SceneRow>(scenes.map(s => [s.id, s]));

    const lines: string[] = [`共 ${scenes.length} 个章节：`, ""];
    for (const s of scenes) {
      const indent = s.parentId ? "  " : "";
      const parent = s.parentId ? byId.get(s.parentId) : null;
      const parentLabel = parent ? `（隶属：${parent.number} ${parent.name ?? ""}）` : "";
      const title = `${indent}**${s.number}** ${s.name ?? "（无标题）"}${parentLabel}`;
      const meta: string[] = [];
      if (s.blockCount > 0)       meta.push(`${s.blockCount} 个块`);
      if (s.expectedDuration)     meta.push(`预计 ${s.expectedDuration} 分钟`);
      lines.push(title);
      if (meta.length)            lines.push(`${indent}  ${meta.join("  |  ")}`);
      if (s.synopsis)             lines.push(`${indent}  梗概：${s.synopsis}`);
      if (s.actionLine)           lines.push(`${indent}  动作提示：${s.actionLine}`);
      if (s.music)                lines.push(`${indent}  音乐：${s.music}`);
      if (s.stageNotes)           lines.push(`${indent}  舞台注记：${s.stageNotes}`);
      lines.push("");
    }

    return lines.join("\n").trimEnd();
  },
};
