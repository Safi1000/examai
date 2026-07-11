"use client";

import Link from "next/link";
import type { Notification } from "@/types";
import { Icon, Pill } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatDateTime, timeAgo } from "@/lib/time";
import { ctaLabel, toneChip, typeMeta } from "@/components/notifications/meta";

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * The exact test time this notification is about, taken from the DB value in
 * `metadata` (not recomputed) and rendered in the viewer's local timezone. This
 * is what keeps e.g. a "Test Closed" notice showing the real close time even if
 * the scheduler fired a little late.
 */
function scheduleLine(n: Notification): { label: string; iso: string } | null {
  const m = n.metadata ?? {};
  switch (n.type) {
    case "test_closed":
      return str(m.closesAt) ? { label: "Closed at", iso: str(m.closesAt)! } : null;
    case "test_closing":
      return str(m.closesAt) ? { label: "Closes", iso: str(m.closesAt)! } : null;
    case "test_started":
    case "test_reminder":
      return str(m.opensAt) ? { label: "Starts", iso: str(m.opensAt)! } : null;
    case "test_posted":
    case "test_updated":
      return str(m.closesAt) ? { label: "Closes", iso: str(m.closesAt)! } : null;
    default:
      return null;
  }
}

export function NotificationItem({
  n,
  onMarkRead,
  onRemove,
  onActivate,
}: {
  n: Notification;
  onMarkRead: (id: string) => void;
  onRemove: (id: string) => void;
  /** Fired when the CTA is followed (mark read + close the panel). */
  onActivate: (id: string) => void;
}) {
  const { icon, tone } = typeMeta(n.type);
  const cta = n.actionUrl ? ctaLabel(n.type) : null;
  const subject = str(n.metadata?.subject);
  const testCode = str(n.metadata?.testCode);
  const schedule = scheduleLine(n);

  return (
    <li
      className={cn(
        "group relative flex gap-3 px-4 py-3 transition-colors",
        n.isRead ? "bg-transparent hover:bg-surface-2/60" : "bg-brand-soft/40 hover:bg-brand-soft/60",
      )}
    >
      {/* Unread rail */}
      {!n.isRead && <span className="absolute inset-y-0 left-0 w-[3px] rounded-r bg-brand" aria-hidden />}

      {/* Type icon chip */}
      <span
        className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full [&_svg]:h-[18px] [&_svg]:w-[18px]", toneChip[tone])}
        aria-hidden
      >
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={cn("min-w-0 flex-1 text-sm leading-snug", n.isRead ? "font-semibold text-ink-2" : "font-bold text-ink")}>
            {n.title}
          </p>
          {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
        </div>

        <p className="mt-0.5 line-clamp-3 text-sm text-ink-2">{n.message}</p>

        {schedule && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-2">
            <Icon.Clock className="h-3.5 w-3.5 shrink-0 text-ink-3" />
            <span className="font-semibold">{schedule.label}</span>
            <span className="tabular">{formatDateTime(schedule.iso)}</span>
          </p>
        )}

        {(subject || testCode) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {subject && (
              <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">
                {subject}
              </span>
            )}
            {testCode && <Pill className="text-[11px]">{testCode}</Pill>}
          </div>
        )}

        <div className="mt-2 flex items-center gap-3">
          <span className="font-mono text-[11px] tracking-tight text-ink-3">{timeAgo(n.createdAt)}</span>

          {cta && n.actionUrl && (
            <Link
              href={n.actionUrl}
              onClick={() => onActivate(n.id)}
              className={buttonClasses({ variant: "primary", size: "sm", className: "h-7 px-2.5 text-xs" })}
            >
              {cta}
            </Link>
          )}

          {/* Hover actions */}
          <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {!n.isRead && (
              <button
                onClick={() => onMarkRead(n.id)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
                aria-label="Mark as read"
                title="Mark as read"
              >
                <Icon.Check className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => onRemove(n.id)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-error-soft hover:text-error"
              aria-label="Delete notification"
              title="Delete"
            >
              <Icon.Trash className="h-4 w-4" />
            </button>
          </span>
        </div>
      </div>
    </li>
  );
}
