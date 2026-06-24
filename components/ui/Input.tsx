"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

const fieldShell =
  "w-full rounded-md border bg-surface px-3.5 text-ink placeholder:text-ink-3 transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & FieldProps
>(function Input({ label, hint, error, required, className, id, ...rest }, ref) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="w-full">
      {label && <Label htmlFor={fieldId} required={required}>{label}</Label>}
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined}
        className={cn(
          fieldShell,
          "h-12",
          error ? "border-error" : "border-border-strong",
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={`${fieldId}-err`} className="mt-1.5 text-sm font-medium text-error">{error}</p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-sm text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps
>(function Textarea({ label, hint, error, required, className, id, ...rest }, ref) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="w-full">
      {label && <Label htmlFor={fieldId} required={required}>{label}</Label>}
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        className={cn(
          fieldShell,
          "min-h-28 resize-y py-3 leading-relaxed",
          error ? "border-error" : "border-border-strong",
          className,
        )}
        {...rest}
      />
      {error && <p className="mt-1.5 text-sm font-medium text-error">{error}</p>}
    </div>
  );
});

export function Label({
  children,
  required,
  ...rest
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className="mb-1.5 block text-sm font-semibold text-ink-2" {...rest}>
      {children}
      {required && <span className="ml-0.5 text-error">*</span>}
    </label>
  );
}
