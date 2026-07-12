"use client";

import Link from "next/link";
import type { ExamLock } from "@/types";
import { Icon, Pill } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/time";
import { VIOLATION_LABEL } from "@/components/security/meta";

/**
 * Full-screen takeover shown in place of the exam once a student is locked.
 * There is nothing actionable here on purpose — answering, navigation and
 * submission are all gone. It clears itself the moment the teacher unlocks
 * (Realtime flips the lock row, the runner re-renders).
 */
export function ExamLockScreen({ lock, testTitle }: { lock: ExamLock; testTitle: string }) {
  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error-soft text-error">
        <Icon.Lock className="h-8 w-8" />
      </div>

      <h1 className="mt-5 max-w-lg font-display text-2xl font-extrabold tracking-tight text-ink">
        Your exam has been locked due to a security violation.
      </h1>
      <p className="mt-2 max-w-md text-sm text-ink-2">
        Please wait for your teacher to unlock your exam. This screen will clear on its own — do not
        refresh or close the tab.
      </p>

      <dl className="mt-6 w-full max-w-sm divide-y divide-border rounded-lg border border-border bg-surface text-left text-sm">
        <Row label="Exam">
          <span className="font-semibold text-ink">{testTitle}</span>
        </Row>
        <Row label="Reason">
          <Pill>{lock.reason ? VIOLATION_LABEL[lock.reason] : "Security violation"}</Pill>
        </Row>
        <Row label="Locked at">
          <span className="tabular text-ink">{lock.lockedAt ? formatDateTime(lock.lockedAt) : "—"}</span>
        </Row>
        <Row label="Violations">
          <span className="font-mono font-semibold text-ink">{lock.violationCount}</span>
        </Row>
      </dl>

      <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-ink-3">
        <span className="h-2 w-2 animate-low-pulse rounded-full bg-warning" />
        Waiting for your teacher…
      </p>

      <Link href="/dashboard" className={buttonClasses({ variant: "secondary", className: "mt-6" })}>
        Back to home
      </Link>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-ink-2">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
