/**
 * Pure time + countdown helpers. Kept side-effect-free so they're testable;
 * "now" is always passed in by callers (hooks own the clock).
 */

/** Format seconds as mm:ss (or h:mm:ss past an hour). */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export type TimerState = "normal" | "warning" | "critical";

/**
 * Timer color logic (recolored, same thresholds as the original spec):
 *  - critical  ≤ 60s remaining (pulses)
 *  - warning   ≤ 5 minutes remaining (final-five warning)
 *  - normal    otherwise
 */
export function timerState(remainingSeconds: number): TimerState {
  if (remainingSeconds <= 60) return "critical";
  if (remainingSeconds <= 5 * 60) return "warning";
  return "normal";
}

/** Whole seconds between two ISO timestamps (b - a). */
export function secondsBetween(aIso: string, bIso: string): number {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 1000);
}

/** Human duration like "42m 10s" from a second count. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return `${m}m ${String(rem).padStart(2, "0")}s`;
}

/** Friendly absolute timestamp, e.g. "17 Jun 2026, 14:05". */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Canonical full date + time, e.g. "15 July 2026, 09:00 AM". Rendered in the
 * viewer's local timezone (values are stored UTC), so admin and student see the
 * same wall-clock instant in their own zone. Used for test start/close times.
 */
export function formatDateTime(iso: string): string {
  return new Date(iso)
    .toLocaleString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}

/** Just the local clock time, e.g. "11:00 AM". */
export function formatTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}

/**
 * Compact relative time, e.g. "just now", "5m", "3h", "2d", or an absolute date
 * past a week. `nowMs` defaults to Date.now() (callers in tests can pin it).
 */
export function timeAgo(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((nowMs - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return formatDate(iso);
}

/** Day bucket relative to `nowMs` — drives the Today/Yesterday/Older grouping. */
export type DayBucket = "today" | "yesterday" | "older";

export function dayBucket(iso: string, nowMs: number = Date.now()): DayBucket {
  const d = new Date(iso);
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const t = d.getTime();
  if (t >= startOfToday) return "today";
  if (t >= startOfYesterday) return "yesterday";
  return "older";
}

/** Test scheduling state relative to a supplied `now`. */
export type TestWindow = "future" | "open" | "closed";

export function testWindow(opensAt: string, closesAt: string, nowMs: number): TestWindow {
  const open = new Date(opensAt).getTime();
  const close = new Date(closesAt).getTime();
  if (nowMs < open) return "future";
  if (nowMs >= close) return "closed";
  return "open";
}

/** Effective (display) status — what the user should actually see. */
export type EffectiveTestStatus = "draft" | "scheduled" | "active" | "closed" | "cancelled";

/**
 * Derive the live status from the stored lifecycle state + schedule, so status
 * tracks the clock automatically without any DB write. Manual overrides
 * (draft/closed/cancelled) always win; a schedule-driven ("active") test resolves
 * to scheduled → active → closed by comparing `now` against opens/closes.
 * Timezone-safe: ISO timestamps are absolute instants.
 */
export function effectiveTestStatus(
  test: { status: "draft" | "active" | "closed" | "cancelled"; opensAt: string; closesAt: string },
  nowMs: number,
): EffectiveTestStatus {
  if (test.status === "draft") return "draft";
  if (test.status === "cancelled") return "cancelled";
  if (test.status === "closed") return "closed"; // manual force-close
  const w = testWindow(test.opensAt, test.closesAt, nowMs);
  return w === "future" ? "scheduled" : w === "open" ? "active" : "closed";
}
