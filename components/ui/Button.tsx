"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-brand text-on-brand hover:bg-brand-strong active:bg-brand-strong shadow-[var(--shadow-sm)]",
  secondary:
    "bg-surface text-ink border border-border-strong hover:bg-surface-2 active:bg-surface-2",
  ghost: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-error text-on-brand hover:opacity-90 active:opacity-90",
};

const sizeClass: Record<Size, string> = {
  sm: "h-10 px-3 text-sm rounded-md",
  md: "h-12 px-5 text-sm rounded-md",
  lg: "h-12 px-6 text-base rounded-lg",
};

const baseClass =
  "inline-flex select-none items-center justify-center gap-2 font-semibold transition-[background,opacity,transform] duration-150 ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

/** Class string for rendering a Link styled as a button (avoids <a> in <button>). */
export function buttonClasses(opts?: { variant?: Variant; size?: Size; fullWidth?: boolean; className?: string }) {
  const { variant = "primary", size = "md", fullWidth, className } = opts ?? {};
  return cn(baseClass, variantClass[variant], sizeClass[size], fullWidth && "w-full", className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, fullWidth, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 font-semibold transition-[background,opacity,transform] duration-150 ease-[var(--ease-out)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98]",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        variantClass[variant],
        sizeClass[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size={16} className={variant === "secondary" || variant === "ghost" ? "text-ink-2" : "text-on-brand"} />}
      {children}
    </button>
  );
});
