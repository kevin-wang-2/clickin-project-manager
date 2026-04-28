"use client";

import { useState } from "react";
import Link from "next/link";
import { BASE_PATH } from "@/lib/base-path";
import { fmtDateTime, fmtTime as fmtTimeTz, fmtDate } from "@/lib/tz";
import type {
  ProductionEvent,
  EventScheduleItemWithParticipants,
  EventReport,
} from "@/lib/event-db";

const EVENT_TYPE_LABELS: Record<string, string> = {
  rehearsal: "排练", performance: "演出", meeting: "会议", custom: "其他",
};
const ITEM_TYPE_LABELS: Record<string, string> = {
  scene_rehearsal: "场景排练", fitting: "服装", sound_check: "音响",
  tech_rehearsal: "技排", meeting: "会议", break: "休息", custom: "其他",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "草稿", published: "已发布", completed: "已完成", cancelled: "已取消",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-500",
  published: "bg-blue-50 text-blue-600",
  completed: "bg-green-50 text-green-600",
  cancelled: "bg-red-50 text-red-400",
};

function fmt(iso: string | null): string { return fmtDateTime(iso); }
function fmtTime(iso: string | null): string { return fmtTimeTz(iso); }

type Props = {
  productionId: string;
  eventId: string;
  event: ProductionEvent;
  scheduleItems: EventScheduleItemWithParticipants[];
  reports: EventReport[];
  isAssignee: boolean;
  selfParticipantRole: "participant" | "follower" | null;
  canViewFull?: boolean;
};

export default function EventFollowerClient({
  productionId, eventId, event,
  scheduleItems, reports,
  isAssignee, selfParticipantRole, canViewFull,
}: Props) {
  const [followBusy, setFollowBusy] = useState(false);
  const [selfRole, setSelfRole] = useState(selfParticipantRole);

  const sortedItems = [...scheduleItems].sort((a, b) => {
    if (!a.startTime && !b.startTime) return a.orderIndex - b.orderIndex;
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  async function toggleFollow() {
    setFollowBusy(true);
    try {
      const method = selfRole === "follower" ? "DELETE" : "POST";
      const res = await fetch(`${BASE_PATH}/api/production/${productionId}/events/${eventId}/follow`, { method });
      if (res.ok) {
        const data = await res.json();
        setSelfRole(data.role ?? null);
      }
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="max-w-xl mx-auto px-4 pt-8 pb-16">
        {/* Nav */}
        <div className="flex items-center justify-between mb-5">
          <Link href={`/production/${productionId}/events`} className="text-xs text-zinc-400 hover:text-zinc-600">
            ← Events
          </Link>
          {canViewFull && (
            <Link href={`/production/${productionId}/events/${eventId}`}
              className="text-xs text-zinc-400 hover:text-zinc-600">
              编辑视角 →
            </Link>
          )}
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-800 leading-tight">{event.title}</h1>
            <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
              <span>{EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}</span>
              {event.startTime && <span>{fmt(event.startTime)}</span>}
              {event.location && <span>· {event.location}</span>}
            </div>
            {event.description && (
              <p className="text-xs text-zinc-500 mt-2 whitespace-pre-wrap">{event.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {selfRole === "participant" ? (
              <span className="text-[11px] text-zinc-400">已参与</span>
            ) : (
              <button
                onClick={toggleFollow}
                disabled={followBusy}
                className={`text-xs px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                  selfRole === "follower"
                    ? "bg-blue-50 text-blue-500 hover:bg-blue-100"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                }`}
              >
                {selfRole === "follower" ? "已关注" : "关注"}
              </button>
            )}
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[event.status] ?? "bg-zinc-100 text-zinc-400"}`}>
              {STATUS_LABELS[event.status] ?? event.status}
            </span>
          </div>
        </div>


        {/* Schedule */}
        <section className="mb-6">
          <h2 className="text-[11px] font-semibold tracking-widest text-zinc-400 uppercase mb-3">事件流程</h2>
          {sortedItems.length === 0 ? (
            <p className="text-xs text-zinc-300 py-4 text-center">暂无流程</p>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-zinc-50">
              {sortedItems.map(item => (
                <div key={item.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-800">{item.title}</span>
                        {item.itemType !== "custom" && (
                          <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">
                            {ITEM_TYPE_LABELS[item.itemType] ?? item.itemType}
                          </span>
                        )}
                      </div>
                      {item.location && (
                        <p className="text-[11px] text-zinc-400 mt-0.5">{item.location}</p>
                      )}
                      {item.notes && (
                        <p className="text-[11px] text-zinc-400 mt-0.5 whitespace-pre-wrap">{item.notes}</p>
                      )}
                    </div>
                    {(item.startTime || item.endTime) && (
                      <div className="shrink-0 text-right text-xs text-zinc-500 font-mono">
                        {fmtTime(item.startTime)}
                        {item.endTime && (
                          <span className="text-zinc-300"> – {fmtTime(item.endTime)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Reports */}
        {reports.length > 0 && (
          <section>
            <h2 className="text-[11px] font-semibold tracking-widest text-zinc-400 uppercase mb-3">报告</h2>
            <div className="flex flex-col gap-2">
              {reports.map(report => (
                <Link
                  key={report.id}
                  href={`/production/${productionId}/events/${eventId}/reports/${report.id}`}
                  className="bg-white rounded-2xl shadow-sm px-5 py-4 flex items-center justify-between gap-3 hover:bg-zinc-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-800">{report.title}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {report.publishedAt ? fmtDate(report.publishedAt) : "草稿"}
                    </p>
                  </div>
                  <span className="shrink-0 text-zinc-300 text-sm">›</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
