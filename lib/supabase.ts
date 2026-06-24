"use client";

/**
 * The browser Supabase client (singleton). Auth + every table read/write in the
 * app goes through this; Row-Level Security on the project enforces cohort
 * scoping and hides answer keys (see the SQL migrations). The publishable/anon
 * key is safe to ship — it carries no privileges of its own.
 *
 * The client is created lazily and the env check happens on first use (not at
 * module load) so server prerendering during `next build` never evaluates it —
 * supabase() is only ever called from client effects/handlers.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    if (!url || !anonKey) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in your environment (Vercel project settings, or .env.local locally).",
      );
    }
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
