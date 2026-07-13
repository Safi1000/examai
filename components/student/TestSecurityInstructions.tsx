"use client";

import type { Test } from "@/types";
import { Button, Pill, Icon } from "@/components/ui";

/**
 * Pre-test security briefing. Shown once, in place of the runner, before the
 * countdown starts — so a lock never comes as a surprise.
 *
 * Non-dismissible by construction: it replaces the runner as the whole page
 * (no backdrop, no Escape, no outside-click), so the only way forward is the
 * acknowledge button. The listed rules mirror exactly what useExamSecurity.ts
 * enforces — nothing more (there is intentionally no fullscreen rule), nothing
 * less. Keep this list in sync if the hook's triggers ever change.
 */

/** Blocked actions, in plain student-facing wording. */
const RULES: { title: string; detail: string }[] = [
  {
    title: "Stay in this window",
    detail: "Don't switch tabs, windows, or apps, and don't click away from the exam.",
  },
  {
    title: "Don't copy, cut, or paste",
    detail: "Including the keyboard shortcuts Ctrl / ⌘ + C, X, and V.",
  },
  {
    title: "Don't right-click",
    detail: "The right-click menu is disabled during the exam.",
  },
  {
    title: "Don't open developer tools",
    detail: "F12, or Ctrl / ⌘ + Shift + I, J, or C.",
  },
  {
    title: "Don't use other blocked shortcuts",
    detail: "Select all (Ctrl / ⌘ + A), print (＋ P), save (＋ S), or view source (＋ U).",
  },
];

export function TestSecurityInstructions({
  test,
  onStart,
}: {
  test: Test;
  onStart: () => void;
}) {
  return (
    <div className="min-h-dvh overflow-y-auto bg-paper px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-lg">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Icon.Lock className="h-7 w-7" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-ink">
            Before you begin — exam security rules
          </h1>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <span className="text-sm font-semibold text-ink-2">{test.title}</span>
            <Pill>{test.testCode}</Pill>
          </div>
          <p className="mt-3 max-w-md text-sm text-ink-2">
            This exam is monitored. The timer starts only after you tap the button below — take a
            moment to read these rules first.
          </p>
        </div>

        {/* The actual blocked actions */}
        <ul className="mt-6 space-y-2.5">
          {RULES.map((r) => (
            <li
              key={r.title}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3.5"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-error-soft text-error">
                <Icon.Close className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{r.title}</span>
                <span className="mt-0.5 block text-sm text-ink-2">{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* One-strike warning — stated plainly, not buried */}
        <div className="mt-5 rounded-lg border border-error/40 bg-error-soft p-4">
          <div className="flex items-center gap-2 text-error">
            <Icon.Warn className="h-5 w-5 shrink-0" />
            <p className="text-sm font-bold">One-strike policy — no warnings</p>
          </div>
          <p className="mt-1.5 text-sm text-ink">
            Doing <span className="font-semibold">any single one</span> of the actions above locks
            your exam <span className="font-semibold">immediately</span>. There is no warning and no
            second chance.
          </p>
        </div>

        {/* What a lock actually means */}
        <div className="mt-3 rounded-lg border border-border bg-surface-2/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-2">If your exam locks</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
            <li className="flex items-start gap-2">
              <Icon.Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
              You can't answer, move between questions, or submit — the exam is fully blocked.
            </li>
            <li className="flex items-start gap-2">
              <Icon.Users className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
              Only your teacher can unlock it. You'll wait on a lock screen until they do.
            </li>
            <li className="flex items-start gap-2">
              <Icon.Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
              The timer keeps running while you're locked, so that time comes out of your exam.
            </li>
          </ul>
        </div>

        <Button className="mt-6" fullWidth onClick={onStart}>
          I understand — start test <Icon.ChevronRight className="h-4 w-4" />
        </Button>
        <p className="mt-2 text-center text-xs text-ink-3">
          Tapping this starts your timer and opens the first question.
        </p>
      </div>
    </div>
  );
}
