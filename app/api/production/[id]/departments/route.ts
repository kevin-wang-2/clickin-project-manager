import { type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { getProductionMemberContext } from "@/lib/db";
import { hasPermission } from "@/lib/roles";
import {
  listEventDepartments,
  createEventDepartment,
} from "@/lib/event-db";

type Ctx = { params: Promise<{ id: string }> };

let _seq = 0;
const uid = () => `dept${Date.now().toString(36)}${(++_seq).toString(36)}`;

async function getCtx(req: NextRequest, productionId: string) {
  const session = getSession(req.cookies);
  if (!session) return { session: null, memberRoles: null, overrides: new Map() };
  const { memberRoles, overrides } = await getProductionMemberContext(
    session.openId, session.isAdmin, productionId
  );
  return { session, memberRoles, overrides };
}

/** GET — list all departments and groups for a production. Requires any member. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { session, memberRoles, overrides } = await getCtx(req, id);
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  if (!hasPermission("event:follow", session.isAdmin, memberRoles, overrides))
    return Response.json({ error: "无权访问" }, { status: 403 });

  const departments = await listEventDepartments(id);
  return Response.json({ departments });
}

/** POST — create a department or group. Requires dept:manage. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { session, memberRoles, overrides } = await getCtx(req, id);
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  if (!hasPermission("dept:manage", session.isAdmin, memberRoles, overrides))
    return Response.json({ error: "权限不足" }, { status: 403 });

  const body = (await req.json()) as {
    name?: string;
    kind?: string;
    displayOrder?: number;
  };

  const name = body.name?.trim();
  if (!name) return Response.json({ error: "名称不能为空" }, { status: 400 });

  const kind = body.kind === "group" ? "group" : "dept";
  const displayOrder = typeof body.displayOrder === "number" ? body.displayOrder : 0;

  const dept = await createEventDepartment({
    id: uid(),
    productionId: id,
    name,
    kind,
    displayOrder,
  });

  return Response.json({ department: dept }, { status: 201 });
}
