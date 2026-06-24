import type { CohortColor } from "@/types";
import { cohortVar } from "@/lib/tokens";
import { cn } from "@/lib/cn";

export function CohortDot({
  color,
  size = 10,
  className,
}: {
  color: CohortColor;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{ width: size, height: size, backgroundColor: cohortVar(color) }}
    />
  );
}

/** Dot + name, used in lists and filters. */
export function CohortTag({
  color,
  name,
  className,
}: {
  color: CohortColor;
  name: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-ink-2", className)}>
      <CohortDot color={color} />
      {name}
    </span>
  );
}
