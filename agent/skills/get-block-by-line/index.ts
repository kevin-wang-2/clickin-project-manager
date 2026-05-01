import type { SkillModule } from "../_types";
import type { BotContext } from "../../types";
import { config } from "./config";
import { getBlockByLine, getPageMapForProduction } from "../../db-script";
import { formatBlock } from "../get-block-by-id/index";

type Args = { line: number };

export const getBlockByLineSkill: SkillModule<Args> = {
  config,
  async run(ctx: BotContext, args: Args): Promise<string> {
    const productionId = ctx.productionContext?.productionId;
    if (!productionId) return "❌ 未设置当前 production，请先调用 focus_production。";

    const line = Number(args?.line);
    if (!Number.isInteger(line) || line < 1)
      return "❌ line 参数无效，请提供大于等于 1 的整数行号。";

    const block = await getBlockByLine(productionId, line);
    if (!block) return `❌ 行号 ${line} 不存在（超出剧本范围）。`;

    const pageMap = await getPageMapForProduction(productionId);
    return formatBlock(block, pageMap);
  },
};
