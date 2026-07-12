"use client";

/**
 * Keeps the store's submissions and question-flags caches live via Supabase
 * Realtime, so the admin submissions/roster/flags views and the student dashboard
 * react to submits, status changes, (scheduled or manual) result releases and
 * admin flag replies without a manual refresh.
 *
 * It patches only the affected row — on each change it re-fetches that single
 * submission (with answers) or flag through the store's cache-only
 * `refreshSubmission` / `refreshFlag`, which never write back, so there's no
 * feedback loop. One channel per signed-in identity; torn down on unmount to
 * avoid duplicate subscriptions / leaks.
 *
 * RLS still scopes every streamed row: admins see all rows, a student only their
 * own (we also add a server-side filter so the student channels are narrow).
 */
import { useEffect } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { getStore } from "@/lib/data/store";

export function useRealtimeSync() {
  const { session } = useAuth();
  const role = session?.role ?? null;
  const studentId = session?.studentId ?? null;
  const key = session ? `${role}:${studentId ?? ""}` : null;

  useEffect(() => {
    if (!session) return;
    if (role === "student" && !studentId) return;

    const filter = role === "student" ? `student_id=eq.${studentId}` : undefined;

    const rowId = (payload: RealtimePostgresChangesPayload<{ id?: string }>) =>
      (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id;

    const channel = supabase()
      .channel(`sync:${key}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "submissions", ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<{ id?: string }>) => {
          const id = rowId(payload);
          if (id) void getStore().refreshSubmission(id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "question_flags", ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<{ id?: string }>) => {
          const id = rowId(payload);
          if (id) void getStore().refreshFlag(id);
        },
      )
      .subscribe();

    return () => {
      void supabase().removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
