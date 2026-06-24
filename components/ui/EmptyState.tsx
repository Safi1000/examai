import { cn } from "@/lib/cn";

/** Calm, in-voice empty state. Icon is decorative. */
export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface/50 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-ink-3" aria-hidden>
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-2">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
