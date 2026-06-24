import { cn } from "@/lib/cn";

type Tone = "neutral" | "brand" | "success" | "warning" | "error" | "info";

const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-border-strong",
  brand: "bg-brand-soft text-brand border-brand/30",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  error: "bg-error-soft text-error border-error/30",
  info: "bg-info-soft text-info border-info/30",
};

/** Status badge — semantic tone, never a literal color name. */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Mono pill for test codes, IDs, timestamps. */
export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-border-strong bg-surface-2 px-2 py-0.5 font-mono text-xs tracking-tight text-ink-2",
        className,
      )}
    >
      {children}
    </span>
  );
}
