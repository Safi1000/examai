"use client";

import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Sections"
      className={cn("flex gap-1 overflow-x-auto border-b border-border", className)}
    >
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative whitespace-nowrap px-3.5 py-2.5 text-sm font-semibold transition-colors",
              selected ? "text-brand" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                  selected ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-3",
                )}
              >
                {t.count}
              </span>
            )}
            {selected && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        );
      })}
    </div>
  );
}
