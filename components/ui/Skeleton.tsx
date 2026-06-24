import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} aria-hidden />;
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-3 h-6 w-2/3" />
      <Skeleton className="mt-4 h-10 w-full" />
    </div>
  );
}
