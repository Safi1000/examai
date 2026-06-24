"use client";

import type { TimerState } from "@/lib/time";
import { formatCountdown } from "@/lib/time";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

const stateStyle: Record<TimerState, string> = {
  normal: "border-border-strong bg-surface text-ink",
  warning: "border-warning/40 bg-warning-soft text-warning",
  critical: "border-error/50 bg-error-soft text-error",
};

/** Prominent mono countdown that bands color as time drains (pulses < 60s). */
export function CountdownTimer({ remaining, state }: { remaining: number; state: TimerState }) {
  return (
    <div
      role="timer"
      aria-live={state === "normal" ? "off" : "polite"}
      aria-label="Time remaining"
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-lg font-semibold tabular-nums",
        stateStyle[state],
        state === "critical" && "animate-low-pulse",
      )}
    >
      <Icon.Clock className="h-4 w-4" />
      {formatCountdown(remaining)}
    </div>
  );
}
