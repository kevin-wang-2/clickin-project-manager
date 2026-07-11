import { type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { getPool } from "@/lib/pg";
import { getProductionMemberContext } from "@/lib/db";
import { hasPermission } from "@/lib/roles";

async function getCtx(req: NextRequest, productionId: string) {
  const session = getSession(req.cookies);
  if (!session) return { session: null, memberRoles: null, overrides: new Map() };
  const { memberRoles, overrides } = await getProductionMemberContext(session.openId, session.isAdmin, productionId);
  return { session, memberRoles, overrides };
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/production/[id]/scene-table-views/[viewId]/default">
) {
  const { id, viewId } = await ctx.params;
  const { session, memberRoles, overrides } = await getCtx(req, id);
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  if (!hasPermission("script:read", session.isAdmin, memberRoles, overrides)) {
    return Response.json({ error: "无权访问" }, { status: 403 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const existing = await client.query<{ open_id: string }>(
      `SELECT open_id FROM scene_table_view_config WHERE id = $1 AND production_id = $2`,
      [viewId, id]
    );
    if (existing.rowCount === 0) {
      return Response.json({ error: "视图不存在" }, { status: 404 });
    }
    if (existing.rows[0].open_id !== session.openId) {
      return Response.json({ error: "无权修改他人视图" }, { status: 403 });
    }

    await client.query("BEGIN");
    await client.query(
      `UPDATE scene_table_view_config
       SET is_default = false, updated_at = NOW()
       WHERE open_id = $1 AND production_id = $2`,
      [session.openId, id]
    );
    await client.query(
      `UPDATE scene_table_view_config
       SET is_default = true, updated_at = NOW()
       WHERE id = $3 AND open_id = $1 AND production_id = $2`,
      [session.openId, id, viewId]
    );
    await client.query("COMMIT");

    return Response.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
