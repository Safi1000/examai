"use client";

import type { MasteryBand } from "@/lib/scoring";
import { cn } from "@/lib/cn";

const bandColor: Record<MasteryBand, string> = {
  mastery: "bg-success",
  weak: "bg-warning",
  critical: "bg-error",
};
const bandLabel: Record<MasteryBand, string> = {
  mastery: "Strong",
  weak: "Weak",
  critical: "Critical",
};
const bandText: Record<MasteryBand, string> = {
  mastery: "text-success",
  weak: "text-warning",
  critical: "text-error",
};

/**
 * Horizontal mastery bar with the spec's 50% / 60% banding markers.
 * Fill color follows the band; markers stay fixed so the banding reads.
 */
export function MasteryBar({
  topic,
  percent,
  band,
}: {
  topic: string;
  percent: number;
  band: MasteryBand;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-ink">{topic}</span>
        <span className={cn("shrink-0 font-mono text-xs font-semibold", bandText[band])}>
          {Math.round(percent)}% · {bandLabel[band]}
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-label={`${topic} mastery`}>
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out)]", bandColor[band])}
          style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
        />
        {/* Banding thresholds at 50% and 60% */}
        <span className="absolute inset-y-0" style={{ left: "50%" }}>
          <span className="block h-full w-px bg-ink/25" />
        </span>
        <span className="absolute inset-y-0" style={{ left: "60%" }}>
          <span className="block h-full w-px bg-ink/25" />
        </span>
      </div>
    </div>
  );
}
