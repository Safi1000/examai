"use client";

import { useAuth } from "@/lib/auth-context";
import { THEMES } from "@/lib/theme";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Accent-colour picker. Selecting a swatch applies it live and persists it for
 * the current user (server + local cache). Reused by the student and admin
 * settings pages.
 */
export function ThemeSettings() {
  const { themeId, setTheme } = useAuth();

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {THEMES.map((t) => {
        const active = themeId === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
              active ? "border-brand bg-brand-soft" : "border-border-strong bg-surface hover:bg-surface-2",
            )}
          >
            <span
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: t.brand }}
            >
              {active && <Icon.Check className="h-5 w-5" style={{ color: t.onBrand }} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{t.name}</span>
              <span className="block text-xs text-ink-3">{active ? "Selected" : "Tap to apply"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
