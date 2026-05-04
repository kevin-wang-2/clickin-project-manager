import { type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { canUserAccessProduction } from "@/lib/db";
import { getAsset, addAssetMount, listAssetMounts, type MountType, type MountMode } from "@/lib/asset-db";

type Ctx = { params: Promise<{ id: string; assetId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id, assetId } = await ctx.params;
  const session = getSession(req.cookies);
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  const ok = session.isAdmin || (await canUserAccessProduction(session.openId, id));
  if (!ok) return Response.json({ error: "权限不足" }, { status: 403 });

  const asset = await getAsset(assetId);
  if (!asset || asset.productionId !== id) return Response.json({ error: "不存在" }, { status: 404 });

  const mounts = await listAssetMounts(assetId);
  return Response.json({ mounts });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id, assetId } = await ctx.params;
  const session = getSession(req.cookies);
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  const ok = session.isAdmin || (await canUserAccessProduction(session.openId, id));
  if (!ok) return Response.json({ error: "权限不足" }, { status: 403 });

  const asset = await getAsset(assetId);
  if (!asset || asset.productionId !== id) return Response.json({ error: "不存在" }, { status: 404 });

  const isOwner = asset.uploaderOpenId === session.openId;
  if (!isOwner && !session.isAdmin) return Response.json({ error: "权限不足" }, { status: 403 });

  const body = (await req.json()) as {
    mountType: MountType;
    mountId: string;
    mountAuxId?: string | null;
    folderPath?: string | null;
    mountMode?: MountMode | null;
    versionResolved?: boolean | null;
  };

  if (!body.mountType || !body.mountId)
    return Response.json({ error: "缺少 mountType 或 mountId" }, { status: 400 });

  const mount = await addAssetMount({
    assetId, productionId: id,
    mountType: body.mountType, mountId: body.mountId,
    mountAuxId: body.mountAuxId, folderPath: body.folderPath,
    mountMode: body.mountMode, versionResolved: body.versionResolved,
    createdBy: session.openId,
  });
  return Response.json({ mount }, { status: 201 });
}
