import type { SkillModule } from "../_types";
import type { BotContext } from "../../types";
import { config } from "./config";
import { searchBlocks, getPageMapForProduction } from "../../db-script";
import { formatBlock } from "../get-block-by-id/index";

type Args = { query: string; page?: number };

export const searchBlocksSkill: SkillModule<Args> = {
  config,
  async run(ctx: BotContext, args: Args): Promise<string> {
    const productionId = ctx.productionContext?.productionId;
    if (!productionId) return "❌ 未设置当前 production，请先调用 focus_production。";

    const query = args?.query?.trim();
    if (!query) return "❌ 缺少 query 参数。";

    const page = args?.page != null ? Number(args.page) : null;
    if (page !== null && (!Number.isInteger(page) || page < 1))
      return "❌ page 参数无效，请提供大于等于 1 的整数页码。";

    const results = await searchBlocks(productionId, query, page);

    if (results.length === 0) {
      return page !== null
        ? `第 ${page} 页内没有包含「${query}」的 block。`
        : `剧本中没有包含「${query}」的 block。`;
    }

    const pageMap = await getPageMapForProduction(productionId);
    const header = page !== null
      ? `第 ${page} 页内共找到 ${results.length} 个匹配「${query}」的 block：`
      : `共找到 ${results.length} 个匹配「${query}」的 block（最多显示 20 条）：`;

    const sections = results.map((b, i) =>
      `【${i + 1}】\n${formatBlock(b, pageMap)}`,
    );

    return [header, "", ...sections].join("\n\n");
  },
};
