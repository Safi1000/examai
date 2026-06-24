/**
 * TS-side references to the design tokens defined in globals.css.
 * Used where JS needs a color string (hand-rolled SVG charts, inline styles).
 * These return `var(--token)` so the CSS file stays the single source of truth.
 */
import type { CohortColor } from "@/types";

export const color = {
  paper: "var(--color-paper)",
  surface: "var(--color-surface)",
  surface2: "var(--color-surface-2)",
  border: "var(--color-border)",
  borderStrong: "var(--color-border-strong)",
  ink: "var(--color-ink)",
  ink2: "var(--color-ink-2)",
  ink3: "var(--color-ink-3)",
  brand: "var(--color-brand)",
  brandStrong: "var(--color-brand-strong)",
  brandSoft: "var(--color-brand-soft)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  error: "var(--color-error)",
  info: "var(--color-info)",
} as const;

/** The CSS var for a cohort's dot color. */
export function cohortVar(c: CohortColor): string {
  return `var(--color-cohort-${c})`;
}

/** Tailwind text/bg class fragments keyed by semantic role, for badges/pills. */
export const semanticClass = {
  success: { text: "text-success", bg: "bg-success-soft", solid: "bg-success" },
  warning: { text: "text-warning", bg: "bg-warning-soft", solid: "bg-warning" },
  error: { text: "text-error", bg: "bg-error-soft", solid: "bg-error" },
  info: { text: "text-info", bg: "bg-info-soft", solid: "bg-info" },
  brand: { text: "text-brand", bg: "bg-brand-soft", solid: "bg-brand" },
} as const;
