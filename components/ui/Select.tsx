"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";
import { Label } from "@/components/ui/Input";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, className, id, children, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="w-full">
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          className={cn(
            "h-12 w-full appearance-none rounded-md border bg-surface pl-3.5 pr-10 text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
            "disabled:cursor-not-allowed disabled:opacity-60",
            error ? "border-error" : "border-border-strong",
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {error && <p className="mt-1.5 text-sm font-medium text-error">{error}</p>}
    </div>
  );
});
