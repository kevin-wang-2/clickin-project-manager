import { type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { getProductionMemberContext } from "@/lib/db";
import { hasPermission } from "@/lib/roles";
import { getProductionEvent, getEventTechReq, updateEventTechReq, isUserReqAssignee } from "@/lib/event-db";

type Ctx = { params: Promise<{ id: string; eventId: string; reqId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id: productionId, eventId, reqId } = await ctx.params;
  const session = getSession(req.cookies);
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  const { memberRoles, overrides } = await getProductionMemberContext(session.openId, session.isAdmin, productionId);
  if (!hasPermission("event:follow", session.isAdmin, memberRoles, overrides))
    return Response.json({ error: "无权访问" }, { status: 403 });

  const event = await getProductionEvent(eventId, productionId);
  if (!event) return Response.json({ error: "事件不存在" }, { status: 404 });
  const existing = await getEventTechReq(reqId, eventId);
  if (!existing) return Response.json({ error: "技术需求不存在" }, { status: 404 });

  const isAssignee = await isUserReqAssignee(reqId, session.openId);
  const hasFullEdit = hasPermission("event:view_full", session.isAdmin, memberRoles, overrides);
  if (!isAssignee && !hasFullEdit)
    return Response.json({ error: "权限不足" }, { status: 403 });

  const { status } = (await req.json()) as { status?: string };
  if (!status) return Response.json({ error: "缺少 status" }, { status: 400 });

  const updated = await updateEventTechReq(reqId, eventId, { status });
  return Response.json({ techReq: updated });
}
