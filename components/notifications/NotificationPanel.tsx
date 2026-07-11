"use client";

import { useMemo, useRef, useState } from "react";
import type { Notification } from "@/types";
import { EmptyState, Icon, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { dayBucket, type DayBucket } from "@/lib/time";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import type { UseNotifications } from "@/hooks/useNotifications";

type Filter = "all" | "unread";

const BUCKET_LABEL: Record<DayBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  older: "Older",
};

export function NotificationPanel({
  notifications,
  onClose,
}: {
  notifications: UseNotifications;
  onClose: () => void;
}) {
  const { items, unreadCount, loading, error, hasMore, loadingMore, loadMore, markRead, markAllRead, remove, clearRead } =
    notifications;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((n) => {
      if (filter === "unread" && n.isRead) return false;
      if (q && !(`${n.title} ${n.message}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, filter, query]);

  // Group the visible list into Today / Yesterday / Older sections (in order).
  const groups = useMemo(() => {
    const out: { bucket: DayBucket; rows: Notification[] }[] = [];
    for (const n of visible) {
      const b = dayBucket(n.createdAt);
      const last = out[out.length - 1];
      if (last && last.bucket === b) last.rows.push(n);
      else out.push({ bucket: b, rows: [n] });
    }
    return out;
  }, [visible]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || !hasMore || loadingMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) loadMore();
  };

  return (
    <div
      className="flex max-h-[min(32rem,80vh)] w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-lg)]"
      role="dialog"
      aria-label="Notifications"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-extrabold tracking-tight text-ink">Notifications</h2>
          {unreadCount > 0 && (
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-on-brand tabular">{unreadCount}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-40"
            title="Mark all as read"
          >
            <Icon.CheckDouble className="h-4 w-4" />
            <span className="hidden sm:inline">Mark all</span>
          </button>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink sm:hidden"
            aria-label="Close"
          >
            <Icon.Close className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filter + search */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex rounded-md bg-surface-2 p-0.5">
          {(["all", "unread"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-semibold capitalize transition-colors",
                filter === f ? "bg-surface text-ink shadow-[var(--shadow-sm)]" : "text-ink-2 hover:text-ink",
              )}
            >
              {f}
              {f === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Icon.Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="h-8 w-full rounded-md border border-border bg-surface pl-7 pr-2 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-4">
            <EmptyState
              icon={<Icon.Warn />}
              title="Couldn't load notifications"
              message={error}
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Icon.BellOff />}
              title={filter === "unread" || query ? "Nothing to show" : "You're all caught up"}
              message={
                filter === "unread" || query
                  ? "No notifications match this view."
                  : "New tests, results and announcements will appear here."
              }
            />
          </div>
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.bucket}>
                <h3 className="sticky top-0 z-10 bg-surface/95 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-3 backdrop-blur">
                  {BUCKET_LABEL[g.bucket]}
                </h3>
                <ul className="divide-y divide-border">
                  {g.rows.map((n) => (
                    <NotificationItem
                      key={n.id}
                      n={n}
                      onMarkRead={markRead}
                      onRemove={remove}
                      onActivate={(id) => {
                        markRead(id);
                        onClose();
                      }}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {loadingMore && (
              <div className="flex justify-center py-3">
                <Skeleton className="h-3 w-24" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {!loading && !error && items.some((n) => n.isRead) && (
        <div className="border-t border-border px-3 py-2 text-right">
          <button
            onClick={clearRead}
            className="rounded-md px-2 py-1 text-xs font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            Clear read
          </button>
        </div>
      )}
    </div>
  );
}
