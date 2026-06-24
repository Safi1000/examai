import { COMPANY_NAME } from "@/lib/config";
import { cn } from "@/lib/cn";

export function Wordmark({ className }: { className?: string; markSize?: number }) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <span className="font-display text-lg font-extrabold tracking-tight text-ink">{COMPANY_NAME}</span>
    </span>
  );
}

// Kept as a no-op for callers that still import it; renders nothing.
export function BrandMark(_props: { size?: number }) {
  return null;
}
