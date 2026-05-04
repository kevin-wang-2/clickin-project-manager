import { type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { canUserAccessProduction } from "@/lib/db";
import { getAsset, resolveAssetFile } from "@/lib/asset-db";
import { getR2Object } from "@/lib/r2";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await ctx.params;
  const session = getSession(req.cookies);
  if (!session) return new Response("未登录", { status: 401 });
  const ok = session.isAdmin || (await canUserAccessProduction(session.openId, id));
  if (!ok) return new Response("权限不足", { status: 403 });

  const asset = await getAsset(assetId);
  if (!asset || asset.productionId !== id) return new Response("不存在", { status: 404 });
  if (asset.storageType !== "r2") return new Response("非 R2 文件", { status: 400 });

  const versionId = req.nextUrl.searchParams.get("v") ?? undefined;
  const file = await resolveAssetFile(assetId, versionId);
  if (!file) return new Response("文件不存在", { status: 404 });

  // Prefer thumbnail if available, else serve original
  const key = file.thumbnailR2Key ?? file.r2Key;
  if (!key) return new Response("文件不存在", { status: 404 });

  const obj = await getR2Object(key);
  if (!obj) return new Response("文件不存在", { status: 404 });

  return new Response(new Uint8Array(obj.body), {
    headers: {
      "Content-Type": file.thumbnailR2Key ? "image/webp" : (asset.mimeType ?? "application/octet-stream"),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
