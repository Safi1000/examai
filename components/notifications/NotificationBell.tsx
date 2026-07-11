"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";

/**
 * Global notification bell — lives in both dashboard headers. Owns one live
 * notification subscription and renders the dropdown panel. Closes on outside
 * click or Escape.
 */
export function NotificationBell({ className }: { className?: string }) {
  const notifications = useNotifications();
  const { unreadCount } = notifications;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-md text-ink-2 transition-[background,transform] duration-150 ease-[var(--ease-out)]",
          "hover:bg-surface-2 hover:text-ink active:scale-90",
          open && "bg-surface-2 text-ink",
        )}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon.Bell className={cn("h-[20px] w-[20px]", open && "animate-[low-pulse_0.6s_ease-in-out_1]")} />
        {unreadCount > 0 && (
          <>
            {/* Pulsing halo */}
            <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-error/60 animate-[low-pulse_1.4s_ease-in-out_infinite]" aria-hidden />
            {/* Count badge */}
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-paper bg-error px-1 text-[10px] font-bold leading-none text-on-brand tabular animate-[scale-in_0.15s_var(--ease-spring)_both]",
              )}
              aria-hidden
            >
              {badge}
            </span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 origin-top-right animate-[scale-in_0.12s_var(--ease-out)_both]">
          <NotificationPanel notifications={notifications} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
