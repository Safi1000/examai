"use client";

import type { Student } from "@/types";
import { useDismissibleAnnouncements } from "@/hooks/useDismissibleAnnouncements";
import { Icon } from "@/components/ui";
import { formatDate } from "@/lib/time";

export function AnnouncementsPanel({ student }: { student: Student }) {
  const { pinned, dismissible, dismiss } = useDismissibleAnnouncements(student);

  if (pinned.length === 0 && dismissible.length === 0) return null;

  return (
    <section aria-label="Announcements" className="space-y-2.5">
      {pinned.map((a) => (
        <div key={a.id} className="ruled-margin flex items-start gap-3 rounded-lg border border-border bg-info-soft/60 py-3 pl-4 pr-3">
          <Icon.Flag className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">{a.body}</p>
            <p className="mt-1 text-xs text-ink-3">Pinned · {formatDate(a.createdAt)}</p>
          </div>
        </div>
      ))}
      {dismissible.map((a) => (
        <div key={a.id} className="flex items-start gap-3 rounded-lg border border-border bg-surface py-3 pl-4 pr-2">
          <Icon.Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">{a.body}</p>
            <p className="mt-1 text-xs text-ink-3">{formatDate(a.createdAt)}</p>
          </div>
          <button
            onClick={() => dismiss(a.id)}
            aria-label="Dismiss announcement"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <Icon.Close className="h-4 w-4" />
          </button>
        </div>
      ))}
    </section>
  );
}
