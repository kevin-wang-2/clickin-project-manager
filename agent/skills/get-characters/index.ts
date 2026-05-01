import type { SkillModule } from "../_types";
import type { BotContext } from "../../types";
import { config } from "./config";
import { getCharactersForProduction } from "../../db-script";

export const getCharactersSkill: SkillModule<void> = {
  config,
  async run(ctx: BotContext): Promise<string> {
    const productionId = ctx.productionContext?.productionId;
    if (!productionId) return "❌ 未设置当前 production，请先调用 focus_production。";

    const chars = await getCharactersForProduction(productionId);
    if (chars.length === 0) return "当前 production 尚无角色。";

    const lines: string[] = [`共 ${chars.length} 个角色：`, ""];
    for (const c of chars) {
      const badge = c.isAggregate ? "【合并角色】" : "";
      const meta: string[] = [];
      if (c.roleType) meta.push(`角色类型：${c.roleType}`);
      if (c.gender)   meta.push(`性别：${c.gender}`);
      if (c.blockCount > 0) meta.push(`出现在 ${c.blockCount} 个块中`);

      lines.push(`**${c.name}**${badge}`);
      if (meta.length)       lines.push(`  ${meta.join("  |  ")}`);
      if (c.biography)       lines.push(`  简介：${c.biography}`);
      if (c.isAggregate && c.members.length > 0)
        lines.push(`  成员：${c.members.join("、")}`);
      lines.push("");
    }

    return lines.join("\n").trimEnd();
  },
};
