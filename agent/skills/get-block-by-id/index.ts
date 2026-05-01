import type { SkillModule } from "../_types";
import type { BotContext } from "../../types";
import type { ScriptBlockRow } from "../../db-script";
import { config } from "./config";
import { getBlockById, getPageMapForProduction } from "../../db-script";

type Args = { block_id: string };

export function formatBlock(b: ScriptBlockRow, pageMap?: Record<string, number>): string {
  const typeLabel = b.type === "stage" ? "舞台提示" : b.type === "lyric" ? "歌词" : "台词";
  const chars = b.characters.length > 0 ? b.characters.join("、") : "—";
  const scene = b.sceneNumber ? `${b.sceneNumber}${b.sceneName ? " " + b.sceneName : ""}` : "（无场景）";
  const page = pageMap ? (pageMap[b.id] ?? "?") : b.pageNum ?? "?";
  const mark = b.rehearsalMark ? `  排练记号：${b.rehearsalMark}\n` : "";
  return [
    `行号：${b.lineNum}  |  页码：${page}  |  类型：${typeLabel}`,
    `场景：${scene}`,
    `角色：${chars}`,
    mark,
    `内容：`,
    b.content || "（空）",
  ].filter(Boolean).join("\n");
}

export const getBlockByIdSkill: SkillModule<Args> = {
  config,
  async run(ctx: BotContext, args: Args): Promise<string> {
    const productionId = ctx.productionContext?.productionId;
    if (!productionId) return "❌ 未设置当前 production，请先调用 focus_production。";

    const blockId = args?.block_id?.trim();
    if (!blockId) return "❌ 缺少 block_id 参数。";
    if (!/^[0-9a-f-]{8,}$/i.test(blockId))
      return `❌ block_id "${blockId}" 格式无效，请提供正确的 UUID。`;

    const block = await getBlockById(productionId, blockId);
    if (!block) return "❌ 未找到该 block，或该 block 不属于当前 production。";

    const pageMap = await getPageMapForProduction(productionId);
    return formatBlock(block, pageMap);
  },
};
