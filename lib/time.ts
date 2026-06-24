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

/** Test scheduling state relative to a supplied `now`. */
export type TestWindow = "future" | "open" | "closed";

export function testWindow(opensAt: string, closesAt: string, nowMs: number): TestWindow {
  const open = new Date(opensAt).getTime();
  const close = new Date(closesAt).getTime();
  if (nowMs < open) return "future";
  if (nowMs >= close) return "closed";
  return "open";
}
