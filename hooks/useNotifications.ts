"use client";

/**
 * Live notification inbox for the current session.
 *
 * - Loads the first page (RLS-scoped) + an exact unread count on mount.
 * - Subscribes to Supabase Realtime so inserts/updates/deletes apply instantly
 *   with no refresh; the badge tracks unread live. RLS still filters every
 *   streamed row, and we add a channel `filter` so the server only sends this
 *   recipient's rows.
 * - Exposes keyset pagination (loadMore) and optimistic mark-read / delete /
 *   clear actions, each backed by a SECURITY DEFINER RPC.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Notification } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import {
  NOTIF_PAGE_SIZE,
  clearRead as svcClearRead,
  fetchPage,
  fetchUnreadCount,
  mapNotification,
  markAllRead as svcMarkAllRead,
  markRead as svcMarkRead,
  remove as svcRemove,
} from "@/lib/notifications/service";

export interface UseNotifications {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  reload: () => void;
  loadMore: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearRead: () => void;
}

export function useNotifications(): UseNotifications {
  const { session } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Identity used to key realtime + guard stale async writes across sessions.
  const audience = session?.role === "admin" ? "admin" : "student";
  const studentId = session?.studentId ?? null;
  const activeKey = session ? `${audience}:${studentId ?? ""}` : null;
  const keyRef = useRef(activeKey);

  const refreshUnread = useCallback(() => {
    fetchUnreadCount().then(setUnreadCount).catch(() => {});
  }, []);

  const reload = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    const key = keyRef.current;
    fetchPage()
      .then((page) => {
        if (keyRef.current !== key) return; // session changed mid-flight
        setItems(page);
        setHasMore(page.length === NOTIF_PAGE_SIZE);
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => {
        if (keyRef.current === key) setLoading(false);
      });
    refreshUnread();
  }, [session, refreshUnread]);

  // Initial load + reload when the signed-in identity changes. When there's no
  // session we render an empty snapshot (see the return below) rather than
  // resetting state here, so no synchronous setState runs in this effect.
  useEffect(() => {
    keyRef.current = activeKey;
    if (!session) return;
    // Defer to a macrotask so the fetch's setState doesn't run synchronously in
    // the effect body (mirrors the auth-context bootstrap pattern).
    const t = setTimeout(() => reload(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  // Realtime channel scoped to this recipient.
  useEffect(() => {
    if (!session) return;
    const filter =
      audience === "admin" ? "audience=eq.admin" : `recipient_student_id=eq.${studentId}`;
    if (audience === "student" && !studentId) return;

    const channel = supabase()
      .channel(`notif:${activeKey}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (payload.eventType === "INSERT") {
            const n = mapNotification(payload.new);
            setItems((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
            if (!n.isRead) setUnreadCount((c) => c + 1);
          } else if (payload.eventType === "UPDATE") {
            const n = mapNotification(payload.new);
            setItems((prev) => prev.map((x) => (x.id === n.id ? n : x)));
            refreshUnread();
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string })?.id;
            if (id) setItems((prev) => prev.filter((x) => x.id !== id));
            refreshUnread();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase().removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || items.length === 0) return;
    setLoadingMore(true);
    const oldest = items[items.length - 1].createdAt;
    const key = keyRef.current;
    fetchPage(oldest)
      .then((page) => {
        if (keyRef.current !== key) return;
        setItems((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...page.filter((x) => !seen.has(x.id))];
        });
        setHasMore(page.length === NOTIF_PAGE_SIZE);
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoadingMore(false));
  }, [items, hasMore, loadingMore]);

  // --- Optimistic mutations (RPC-backed; realtime echo reconciles by id) ---
  const markRead = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((x) => (x.id === id && !x.isRead ? { ...x, isRead: true, readAt: new Date().toISOString() } : x)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    svcMarkRead(id).catch(() => {}).finally(refreshUnread);
  }, [refreshUnread]);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((x) => (x.isRead ? x : { ...x, isRead: true, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    svcMarkAllRead().catch(() => {}).finally(refreshUnread);
  }, [refreshUnread]);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const gone = prev.find((x) => x.id === id);
      if (gone && !gone.isRead) setUnreadCount((c) => Math.max(0, c - 1));
      return prev.filter((x) => x.id !== id);
    });
    svcRemove(id).catch(() => {}).finally(refreshUnread);
  }, [refreshUnread]);

  const clearRead = useCallback(() => {
    setItems((prev) => prev.filter((x) => !x.isRead));
    svcClearRead().catch(() => {}).finally(refreshUnread);
  }, [refreshUnread]);

  // Signed out → empty snapshot (state is left as-is in memory and repopulated
  // by reload() on next sign-in; the realtime effect has already unsubscribed).
  if (!session) {
    return {
      items: [],
      unreadCount: 0,
      loading: false,
      error: null,
      hasMore: false,
      loadingMore: false,
      reload,
      loadMore,
      markRead,
      markAllRead,
      remove,
      clearRead,
    };
  }

  return {
    items,
    unreadCount,
    loading,
    error,
    hasMore,
    loadingMore,
    reload,
    loadMore,
    markRead,
    markAllRead,
    remove,
    clearRead,
  };
}
