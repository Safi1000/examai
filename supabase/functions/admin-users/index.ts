// Examia — privileged student provisioning.
//
// Creating/updating/deleting a Supabase Auth user needs the service role, which
// must never reach the browser. The admin app calls this function with the
// signed-in admin's JWT; we verify the caller is an admin, then use a
// service-role client to manage both the auth user and the students row.
//
// Students log in by username, so their auth email is synthesized as
// `${username}@${DOMAIN}` (kept in sync with lib/config.ts STUDENT_EMAIL_DOMAIN).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

const DOMAIN = "students.examia.local";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const loginEmail = (username: string) => `${username.trim().toLowerCase()}@${DOMAIN}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Verify the caller is an authenticated admin (their JWT, anon client).
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const {
      data: { user },
      error: authErr,
    } = await caller.auth.getUser();
    if (authErr || !user) return json({ error: "unauthorized" }, 401);
    if ((user.app_metadata as Record<string, unknown>)?.role !== "admin") {
      return json({ error: "forbidden" }, 403);
    }

    // 2. Perform the privileged work with the service role.
    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const body = await req.json();

    switch (body.action) {
      case "create": {
        const { username, email, cohortId, password } = body;
        if (!username || !password) return json({ error: "username and password required" }, 400);
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email: loginEmail(username),
          password,
          email_confirm: true,
          app_metadata: { role: "student" },
        });
        if (cErr || !created.user) return json({ error: cErr?.message ?? "create failed" }, 400);

        const { data: row, error: iErr } = await admin
          .from("students")
          .insert({
            user_id: created.user.id,
            username: String(username).trim(),
            email: email || null,
            cohort_id: cohortId || null,
          })
          .select()
          .single();
        if (iErr) {
          await admin.auth.admin.deleteUser(created.user.id); // roll back the auth user
          return json({ error: iErr.message }, 400);
        }
        return json({ student: row });
      }

      case "bulk-create": {
        // Bulk roster import (Feature 3). Same privileged path as "create", just
        // looped: each student gets an auth user + a students row, and any
        // failure is isolated (rolled back) and reported per-username so the
        // admin sees exactly which rows landed. The client chunks large uploads.
        const students = Array.isArray(body.students) ? body.students : null;
        if (!students) return json({ error: "students array required" }, 400);
        if (students.length === 0) return json({ error: "no students provided" }, 400);
        if (students.length > 200) return json({ error: "too many students in one request (max 200)" }, 400);

        const results: {
          username: string;
          status: "created" | "failed";
          reason?: string;
          student?: unknown;
        }[] = [];

        for (const s of students) {
          const username = String(s?.username ?? "").trim();
          const password = String(s?.password ?? "");
          if (!username || !password) {
            results.push({ username, status: "failed", reason: "username and password required" });
            continue;
          }

          const { data: created, error: cErr } = await admin.auth.admin.createUser({
            email: loginEmail(username),
            password,
            email_confirm: true,
            app_metadata: { role: "student" },
          });
          if (cErr || !created?.user) {
            results.push({ username, status: "failed", reason: cErr?.message ?? "auth create failed" });
            continue;
          }

          const { data: row, error: iErr } = await admin
            .from("students")
            .insert({
              user_id: created.user.id,
              username,
              email: s?.email || null,
              cohort_id: s?.cohortId || null,
            })
            .select()
            .single();
          if (iErr) {
            await admin.auth.admin.deleteUser(created.user.id); // roll back the auth user
            results.push({ username, status: "failed", reason: iErr.message });
            continue;
          }

          results.push({ username, status: "created", student: row });
        }

        return json({ success: true, results });
      }

      case "update": {
        const { studentId, username, email, cohortId, password } = body;
        const { data: existing, error: eErr } = await admin
          .from("students")
          .select("user_id")
          .eq("id", studentId)
          .single();
        if (eErr || !existing) return json({ error: "not found" }, 404);

        const attrs: Record<string, unknown> = {};
        if (username) attrs.email = loginEmail(username); // username drives login email
        if (password) attrs.password = password;
        if (existing.user_id && Object.keys(attrs).length > 0) {
          const { error } = await admin.auth.admin.updateUserById(existing.user_id, attrs);
          if (error) return json({ error: error.message }, 400);
        }

        const { data: row, error: uErr } = await admin
          .from("students")
          .update({ username: String(username).trim(), email: email || null, cohort_id: cohortId || null })
          .eq("id", studentId)
          .select()
          .single();
        if (uErr) return json({ error: uErr.message }, 400);
        return json({ student: row });
      }

      case "delete": {
        const { studentId } = body;
        const { data: existing } = await admin
          .from("students")
          .select("user_id")
          .eq("id", studentId)
          .single();
        await admin.from("students").delete().eq("id", studentId);
        if (existing?.user_id) await admin.auth.admin.deleteUser(existing.user_id);
        return json({ ok: true });
      }

      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
