import type { SkillModule } from "../_types";
import type { BotContext } from "../../types";
import { config } from "./config";
import { queryBlocks, getPageMapForProduction } from "../../db-script";
import { formatBlock } from "../get-block-by-id/index";

type Args = {
  page?:          number;
  type?:          "dialogue" | "stage" | "lyric";
  scene?:         string;
  rehearsal_mark?: string;
  limit?:         number;
};

const VALID_TYPES = new Set(["dialogue", "stage", "lyric"]);

export const queryBlocksSkill: SkillModule<Args> = {
  config,
  async run(ctx: BotContext, args: Args): Promise<string> {
    const productionId = ctx.productionContext?.productionId;
    if (!productionId) return "❌ 未设置当前 production，请先调用 focus_production。";

    const page  = args?.page  != null ? Number(args.page)  : null;
    const limit = args?.limit != null ? Math.min(Number(args.limit), 50) : 30;

    if (page !== null && (!Number.isInteger(page) || page < 1))
      return "❌ page 参数无效，请提供大于等于 1 的整数页码。";

    const type = args?.type ?? null;
    if (type && !VALID_TYPES.has(type))
      return `❌ type 参数无效，可选值为 dialogue / stage / lyric。`;

    const results = await queryBlocks(productionId, {
      page,
      type: type as "dialogue" | "stage" | "lyric" | null,
      scene:         args?.scene?.trim()          || null,
      rehearsalMark: args?.rehearsal_mark?.trim() || null,
      limit,
    });

    if (results.length === 0) return "未找到符合条件的 block。";

    const pageMap = await getPageMapForProduction(productionId);

    const filterDesc: string[] = [];
    if (page   != null)  filterDesc.push(`第 ${page} 页`);
    if (type)            filterDesc.push(`类型：${type}`);
    if (args?.scene)     filterDesc.push(`章节含「${args.scene}」`);
    if (args?.rehearsal_mark) filterDesc.push(`排练记号含「${args.rehearsal_mark}」`);
    const header = `共 ${results.length} 条结果${filterDesc.length ? `（${filterDesc.join("，")}）` : ""}：`;

    const sections = results.map((b, i) => `【${i + 1}】\n${formatBlock(b, pageMap)}`);
    return [header, "", ...sections].join("\n\n");
  },
};
