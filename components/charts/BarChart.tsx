"use client";

import { cn } from "@/lib/cn";

export interface Bar {
  label: string;
  value: number;
  /** semantic role → token color */
  role?: "brand" | "success" | "warning" | "error" | "info";
}

const roleBg: Record<NonNullable<Bar["role"]>, string> = {
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
};

/**
 * Vertical bar chart (e.g. grade distribution A–F). CSS-driven heights so the
 * bars grow in on first paint. Hand-rolled, no chart library.
 */
export function BarChart({ bars, height = 180 }: { bars: Bar[]; height?: number }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="flex items-end gap-2" style={{ height }} role="img" aria-label="Bar chart">
      {bars.map((b) => {
        const pct = (b.value / max) * 100;
        return (
          <div key={b.label} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-ink-2">{b.value}</span>
            <div className="flex w-full flex-1 items-end">
              <div
                className={cn(
                  "w-full rounded-t-md transition-[height] duration-700 ease-[var(--ease-out)]",
                  roleBg[b.role ?? "brand"],
                )}
                style={{ height: `${Math.max(2, pct)}%` }}
                title={`${b.label}: ${b.value}`}
              />
            </div>
            <span className="text-xs font-semibold text-ink-3">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}
