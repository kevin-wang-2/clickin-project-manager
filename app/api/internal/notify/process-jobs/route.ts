/**
 * Process due notification_job rows.
 * Called by an external cron (e.g. every 15 min):
 *   curl -X POST https://yourapp.example.com/api/internal/notify/process-jobs \
 *        -H "Authorization: Bearer $INTERNAL_NOTIFY_SECRET"
 *
 * Add ?dry=1 to preview cards without sending.
 */
import { type NextRequest } from "next/server";
import { listDueNotificationJobs, markJobProcessed, dispatchDailyCallForEvent } from "@/lib/notify";

function authorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_NOTIFY_SECRET;
  if (!secret) return false;
  return req.headers.get("Authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  const jobs = await listDueNotificationJobs();
  const results: { id: string; ok: boolean; error?: string; dryCards?: unknown }[] = [];

  for (const job of jobs) {
    try {
      const result = await dispatchDailyCallForEvent(job.eventId, dry);
      if (!dry) await markJobProcessed(job.id);
      results.push({ id: job.id, ok: true, ...(dry ? { dryCards: result.dryCards } : {}) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!dry) await markJobProcessed(job.id, msg);
      results.push({ id: job.id, ok: false, error: msg });
    }
  }

  return Response.json({ processed: results.length, dry, results });
}
