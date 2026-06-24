import { cn } from "@/lib/cn";

/** Filed-paper surface. `ruled` adds the signature exam-booklet margin rule. */
export function Card({
  children,
  className,
  ruled,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  ruled?: boolean;
  as?: React.ElementType;
}) {
  return (
    <Tag
      className={cn(
        "rounded-lg border border-border bg-surface shadow-[var(--shadow-sm)]",
        ruled && "ruled-margin",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("border-b border-border px-5 py-4", className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}
