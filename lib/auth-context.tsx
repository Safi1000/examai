"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Role, Session } from "@/types";
import { supabase } from "@/lib/supabase";
import { getStore } from "@/lib/data/store";
import { ADMIN_EMAIL, studentEmail } from "@/lib/config";
import {
  DEFAULT_THEME_ID,
  loadLastThemeId,
  loadThemeId,
  saveThemeId,
  themeUserKey,
} from "@/lib/theme";

interface AuthContextValue {
  session: Session | null;
  /** True while a session is being brought up (initial load or login). */
  initializing: boolean;
  loginStudent: (username: string, password: string) => Promise<boolean>;
  loginAdmin: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isRole: (role: Role) => boolean;
  /** True while a student is still on their temporary password (student only). */
  mustChangePassword: boolean;
  /** Clear the force-change flag in session state after a successful change. */
  clearMustChangePassword: () => void;
  /** Current accent theme id; persists per user (server + local cache). */
  themeId: string;
  setTheme: (id: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Resolve a Supabase user into the app's session shape (role + studentId). */
async function resolveSession(user: User): Promise<Session> {
  const isAdmin = (user.app_metadata as Record<string, unknown>)?.role === "admin";
  if (isAdmin) return { role: "admin" };
  // Same query that resolves studentId also reads the force-change flag — no
  // extra round-trip. Re-read on every session load, so it can't be bypassed by
  // refreshing or navigating directly to a route.
  const { data } = await supabase()
    .from("students")
    .select("id, must_change_password")
    .eq("user_id", user.id)
    .maybeSingle();
  return {
    role: "student",
    studentId: (data?.id as string) ?? undefined,
    mustChangePassword: (data?.must_change_password as boolean) ?? false,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [themeId, setThemeId] = useState<string>(() => loadLastThemeId());
  const currentUserId = useRef<string | null>(null);

  /**
   * Bring up a session: resolve role, hydrate the data cache, publish. Idempotent
   * per user — the synchronous guard+set runs atomically, so whichever of login
   * or the auth listener reaches it first wins and the other no-ops. Safe to call
   * from login (outside the auth lock) but NEVER directly inside onAuthStateChange.
   */
  const establish = useCallback(async (user: User) => {
    if (currentUserId.current === user.id) return;
    currentUserId.current = user.id;
    setInitializing(true);
    try {
      const next = await resolveSession(user);
      await getStore().load();
      setSession(next);
      // Server-stored preference is the source of truth; fall back to this
      // device's last choice, then default. Sync the local cache either way.
      const serverTheme = (user.user_metadata as Record<string, unknown>)?.theme as string | undefined;
      const tid = serverTheme || loadThemeId(themeUserKey(next)) || DEFAULT_THEME_ID;
      setThemeId(tid);
      saveThemeId(themeUserKey(next), tid);
    } catch (e) {
      console.error("auth establish failed", e);
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const sb = supabase();

    // onAuthStateChange fires once on subscribe with the current session, so it
    // doubles as our initial bootstrap. We must NOT await Supabase calls inside
    // this callback (it runs under an auth lock and would deadlock), so establish
    // is deferred to a macrotask outside the callback.
    const { data: sub } = sb.auth.onAuthStateChange((_event, sess) => {
      if (!active) return;
      if (!sess?.user) {
        currentUserId.current = null;
        getStore().reset();
        setSession(null);
        setInitializing(false);
        return;
      }
      if (sess.user.id === currentUserId.current) return; // ignore token-refresh churn
      setTimeout(() => {
        if (active) void establish(sess.user);
      }, 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [establish]);

  const loginStudent = useCallback(
    async (username: string, password: string) => {
      const { data, error } = await supabase().auth.signInWithPassword({
        email: studentEmail(username),
        password,
      });
      if (error || !data.user) return false;
      await establish(data.user); // fully ready before the caller navigates
      return true;
    },
    [establish],
  );

  const loginAdmin = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase().auth.signInWithPassword({ email, password });
      if (error || !data.user) return false;
      if ((data.user.app_metadata as Record<string, unknown>)?.role !== "admin") {
        await supabase().auth.signOut();
        return false;
      }
      await establish(data.user);
      return true;
    },
    [establish],
  );

  /** Flip the force-change flag off locally (store.changePassword persisted it). */
  const clearMustChangePassword = useCallback(() => {
    setSession((s) => (s ? { ...s, mustChangePassword: false } : s));
  }, []);

  const logout = useCallback(() => {
    void supabase().auth.signOut(); // onAuthStateChange clears session + cache
    currentUserId.current = null;
    getStore().reset();
    setSession(null);
    setThemeId(DEFAULT_THEME_ID);
  }, []);

  /** Persist the accent choice for this user: state + local cache + server. */
  const setTheme = useCallback(
    (id: string) => {
      setThemeId(id);
      saveThemeId(themeUserKey(session), id);
      void supabase().auth.updateUser({ data: { theme: id } });
    },
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      loginStudent,
      loginAdmin,
      logout,
      isRole: (role) => session?.role === role,
      mustChangePassword: session?.role === "student" && !!session.mustChangePassword,
      clearMustChangePassword,
      themeId,
      setTheme,
    }),
    [session, initializing, loginStudent, loginAdmin, logout, clearMustChangePassword, themeId, setTheme],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
