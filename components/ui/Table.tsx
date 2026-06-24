import { cn } from "@/lib/cn";

/**
 * Horizontally scrollable table shell. Pass `stickyFirst` to pin the first
 * column on small screens (per the spec's mobile table behavior).
 */
export function TableScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("-mx-1 overflow-x-auto px-1", className)} role="region" aria-label="Scrollable table" tabIndex={0}>
      {children}
    </div>
  );
}

export function Table({
  children,
  stickyFirst,
  className,
}: {
  children: React.ReactNode;
  stickyFirst?: boolean;
  className?: string;
}) {
  return (
    <table
      className={cn(
        "w-full border-collapse text-left text-sm",
        stickyFirst &&
          "[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:bg-surface [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-10 [&_th:first-child]:bg-paper",
        className,
      )}
    >
      {children}
    </table>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-border-strong px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-3",
        className,
      )}
      scope="col"
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-b border-border px-3 py-3 align-middle text-ink", className)}>{children}</td>;
}
