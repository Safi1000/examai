"use client";

import Link from "next/link";
import type { Submission, Test } from "@/types";
import { Badge, Card, Pill, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { testWindow, formatDate } from "@/lib/time";

export function TestCard({
  test,
  submission,
  nowMs,
}: {
  test: Test;
  submission: Submission | null;
  nowMs: number;
}) {
  const window = testWindow(test.opensAt, test.closesAt, nowMs);
  const released = submission?.status === "released";
  const submitted = submission?.status === "submitted";

  return (
    <Card ruled className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>{test.testCode}</Pill>
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">{test.subject}</span>
        </div>
        <h3 className="mt-1.5 text-lg font-bold text-ink">{test.title}</h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-2">
          <span className="inline-flex items-center gap-1"><Icon.Clock className="h-3.5 w-3.5" />{test.durationMinutes} min</span>
          <span>{test.questions.length} questions</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
        {window === "future" && (
          <>
            <Badge tone="neutral"><Icon.Lock className="h-3 w-3" /> Locked</Badge>
            <span className="text-xs text-ink-3">Opens {formatDate(test.opensAt)}</span>
          </>
        )}

        {window === "open" && !submission && (
          <Link href={`/test/${test.id}`} className={buttonClasses({ className: "w-full sm:w-auto" })}>
            Start test
          </Link>
        )}

        {window === "open" && submitted && (
          <div className="text-right">
            <Badge tone="info">Submitted</Badge>
            <p className="mt-1 text-xs text-ink-3">Awaiting results</p>
          </div>
        )}

        {released && (
          <Link href={`/results/${test.id}`} className={buttonClasses({ variant: "secondary", className: "w-full sm:w-auto" })}>
            View result
          </Link>
        )}

        {window === "closed" && submitted && (
          <div className="text-right">
            <Badge tone="warning">Awaiting results</Badge>
            <p className="mt-1 text-xs text-ink-3">Closed {formatDate(test.closesAt)}</p>
          </div>
        )}

        {window === "closed" && !submission && (
          <div className="text-right">
            <Badge tone="neutral">Closed</Badge>
            <p className="mt-1 text-xs text-ink-3">Not attempted</p>
          </div>
        )}
      </div>
    </Card>
  );
}
