// Examia — AI grading assist for written answers.
//
// Given one written answer, this function reads the question, the reusable
// rubric's criteria (label + description), and the student's own text — all
// server-side with the service role — and asks an LLM to judge, per criterion,
// how well the answer demonstrates the CONCEPT (not whether wording matches any
// model answer). It returns a suggestion (never auto-committed) and persists it
// to the admin-only answer_ai_suggestions table.
//
// Provider: Google Gemini (free-tier Flash-Lite). The response contract to the
// client is provider-neutral: { scores, overallRationale, model, at }.
//
// Follows the admin-users pattern: verify the caller is an admin before doing
// anything. No prompt text, key material, or rubric internals are returned
// beyond the shape above.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

// Gemini 3.1 Flash-Lite — GA/stable and on the genuinely-free tier (verified
// against the current Gemini API model + pricing docs). Flash-Lite is plenty
// for a "score + short rationale" structured-JSON grading task.
const MODEL = "gemini-3.1-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  if (status >= 400) console.error("[grade-suggest]", status, JSON.stringify(body));
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

interface Criterion {
  id: string;
  label: string;
  description?: string;
  maxPoints: number;
}
interface AiScore {
  criterionId: string;
  points: number;
  rationale: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_API_KEY");
    if (!geminiKey) return json({ error: "GEMINI_API_KEY not configured" }, 500);

    // 1. Verify the caller is an authenticated admin (their JWT, anon client).
    //    (Unchanged — do not touch the caller verification logic.)
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

    const { answerId } = await req.json();
    if (!answerId) return json({ error: "answerId required" }, 400);

    // 2. Read the answer, its question, and the rubric with the service role.
    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: answer, error: aErr } = await admin
      .from("answers")
      .select("id, type, text, question_id")
      .eq("id", answerId)
      .single();
    if (aErr || !answer) return json({ error: `answer not found: ${aErr?.message ?? ""}` }, 404);
    if (answer.type !== "text") return json({ error: "not a written answer" }, 400);

    const { data: question, error: qErr } = await admin
      .from("questions")
      .select("prompt, rubric_id")
      .eq("id", answer.question_id)
      .single();
    if (qErr || !question) return json({ error: `question not found: ${qErr?.message ?? ""}` }, 404);
    if (!question.rubric_id) return json({ error: "question has no rubric" }, 400);

    const { data: rubric, error: rErr } = await admin
      .from("rubrics")
      .select("criteria")
      .eq("id", question.rubric_id)
      .single();
    if (rErr || !rubric) return json({ error: `rubric not found: ${rErr?.message ?? ""}` }, 404);

    const criteria = (rubric.criteria as Criterion[]) ?? [];
    if (criteria.length === 0) return json({ error: "rubric has no criteria" }, 400);

    const studentText = (answer.text as string) ?? "";

    // 3. Build one call that reasons about the whole answer across every
    //    criterion — cheaper and more coherent than per-criterion calls.
    //    (Prompt logic unchanged from the original implementation.)
    const criteriaBlock = criteria
      .map(
        (c) =>
          `- id: ${c.id}\n  criterion: "${c.label}"${
            c.description ? `\n  guidance: ${c.description}` : ""
          }\n  worth up to ${c.maxPoints} points`,
      )
      .join("\n");

    const prompt =
      `You are grading one written exam answer against a rubric.\n\n` +
      `A rubric criterion describes a CONCEPT the student must demonstrate — NOT a model ` +
      `answer to string-match. The student may phrase things completely differently and ` +
      `still earn full marks if the concept is present. Give partial credit for partial ` +
      `understanding. Never reward mere keyword matching, and never penalise different wording.\n\n` +
      `Question:\n${question.prompt}\n\n` +
      `Rubric criteria:\n${criteriaBlock}\n\n` +
      `Student's answer:\n${studentText || "(blank)"}\n\n` +
      `For each criterion, judge how well the answer demonstrates that concept and assign a ` +
      `score from 0 to its maximum points, with a short rationale. Then give one overall ` +
      `rationale. Respond with JSON only.`;

    // Gemini responseSchema — OpenAPI-subset JSON schema (lowercase types,
    // no additionalProperties).
    const responseSchema = {
      type: "object",
      properties: {
        scores: {
          type: "array",
          items: {
            type: "object",
            properties: {
              criterionId: { type: "string" },
              points: { type: "number" },
              rationale: { type: "string" },
            },
            required: ["criterionId", "points", "rationale"],
          },
        },
        overallRationale: { type: "string" },
      },
      required: ["scores", "overallRationale"],
    };

    let aiResp: Response;
    try {
      aiResp = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          "x-goog-api-key": geminiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema,
          },
        }),
      });
    } catch (netErr) {
      // Network-level failure reaching Gemini.
      return json({ error: `gemini request errored: ${String(netErr)}` }, 502);
    }

    const bodyText = await aiResp.text();
    if (!aiResp.ok) {
      // Surface free-tier quota exhaustion distinctly from other failures.
      if (aiResp.status === 429) {
        return json({ error: `gemini rate limit (429 RESOURCE_EXHAUSTED): ${bodyText}` }, 429);
      }
      return json({ error: `gemini request failed: ${aiResp.status} ${bodyText}` }, 502);
    }

    let completion: {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    try {
      completion = JSON.parse(bodyText);
    } catch {
      return json({ error: `gemini returned non-JSON envelope: ${bodyText.slice(0, 200)}` }, 502);
    }

    const candidate = completion.candidates?.[0];
    const raw = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!raw) {
      // Blocked by safety, truncated, or empty — make the reason loggable.
      const reason = candidate?.finishReason ?? completion.promptFeedback?.blockReason ?? "no output";
      return json({ error: `gemini produced no gradable output (${reason})` }, 502);
    }

    let parsed: { scores?: AiScore[]; overallRationale?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: `gemini returned unparseable output: ${raw.slice(0, 200)}` }, 502);
    }

    // 4. Normalise: one score per rubric criterion, clamped to [0, maxPoints].
    const byId = new Map<string, AiScore>();
    for (const s of parsed.scores ?? []) byId.set(s.criterionId, s);
    const scores: AiScore[] = criteria.map((c) => {
      const s = byId.get(c.id);
      const points = Math.max(0, Math.min(c.maxPoints, Math.round(Number(s?.points ?? 0))));
      return { criterionId: c.id, points, rationale: s?.rationale ?? "" };
    });
    const overallRationale = String(parsed.overallRationale ?? "");
    const at = new Date().toISOString();

    // 5. Persist to the admin-only table (service role bypasses RLS) so the
    //    suggestion survives a page reload.
    const { error: upErr } = await admin.from("answer_ai_suggestions").upsert({
      answer_id: answerId,
      scores,
      overall_rationale: overallRationale,
      model: MODEL,
      created_at: at,
    });
    if (upErr) return json({ error: `persist failed: ${upErr.message}` }, 500);

    return json({ scores, overallRationale, model: MODEL, at });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
