"use client";

/**
 * Keeps the store's submissions cache live via Supabase Realtime, so the admin
 * submissions/roster views and the student dashboard react to submits, status
 * changes and (scheduled or manual) result releases without a manual refresh.
 *
 * It patches only the affected row — on each change it re-fetches that single
 * submission (with answers) through the store's cache-only `refreshSubmission`,
 * which never writes back, so there's no feedback loop. One channel per signed-in
 * identity; torn down on unmount to avoid duplicate subscriptions / leaks.
 *
 * RLS still scopes every streamed row: admins see all submissions, a student only
 * their own (we also add a server-side filter so the student channel is narrow).
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

    const channel = supabase()
      .channel(`sync:submissions:${key}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "submissions", ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<{ id?: string }>) => {
          const id =
            (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id;
          if (id) void getStore().refreshSubmission(id);
        },
      )
      .subscribe();

    return () => {
      void supabase().removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
