import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getProductionMemberContext } from "@/lib/db";
import { hasPermission } from "@/lib/roles";
import {
  getProductionEvent,
  listEventTechReqs,
  listEventDepartments,
  isUserEventTechAssignee,
} from "@/lib/event-db";
import ReqsClient from "@/components/ReqsClient";

export default async function ReqsPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  const { id: productionId, eventId } = await params;
  const cookieStore = await cookies();
  const session = getSession(cookieStore);
  if (!session) redirect("/login");

  const { memberRoles, overrides } = await getProductionMemberContext(session.openId, session.isAdmin, productionId);
  if (!hasPermission("event:follow", session.isAdmin, memberRoles, overrides)) redirect("/");

  const event = await getProductionEvent(eventId, productionId);
  if (!event) redirect(`/production/${productionId}/events`);

  const canViewFull = hasPermission("event:view_full", session.isAdmin, memberRoles, overrides);

  const VISIBLE_STATUSES = new Set(["published", "completed"]);
  if (!canViewFull && !VISIBLE_STATUSES.has(event.status))
    redirect(`/production/${productionId}/events`);

  const isAssignee = await isUserEventTechAssignee(eventId, session.openId);
  if (!canViewFull && !isAssignee) redirect(`/production/${productionId}/events/${eventId}/view`);

  const [techReqs, departments] = await Promise.all([
    listEventTechReqs(eventId),
    listEventDepartments(productionId),
  ]);

  return (
    <ReqsClient
      productionId={productionId}
      eventId={eventId}
      event={event}
      techReqs={techReqs}
      departments={departments}
      currentUserOpenId={session.openId}
    />
  );
}
