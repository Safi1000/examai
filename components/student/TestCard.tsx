"use client";

import Link from "next/link";
import type { Submission, Test } from "@/types";
import { Badge, Card, Pill, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { testWindow, formatDateTime, effectiveTestStatus, type EffectiveTestStatus } from "@/lib/time";

const STATUS_TONE: Record<EffectiveTestStatus, "neutral" | "success" | "warning" | "info" | "error"> = {
  draft: "neutral",
  scheduled: "info",
  active: "success",
  closed: "neutral",
  cancelled: "error",
};

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
  const status = effectiveTestStatus(test, nowMs);
  const cancelled = status === "cancelled";
  const released = submission?.status === "released";
  const submitted = submission?.status === "submitted";

  return (
    <Card ruled className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>{test.testCode}</Pill>
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">{test.subject}</span>
          <Badge tone={STATUS_TONE[status]} className="capitalize">{status}</Badge>
        </div>
        <h3 className="mt-1.5 text-lg font-bold text-ink">{test.title}</h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-2">
          <span className="inline-flex items-center gap-1"><Icon.Clock className="h-3.5 w-3.5" />{test.durationMinutes} min</span>
          <span>{test.questions.length} questions</span>
        </p>
        <dl className="mt-2 space-y-0.5 text-xs text-ink-3">
          <div className="flex items-center gap-1.5">
            <Icon.Calendar className="h-3.5 w-3.5 shrink-0" />
            <dt className="font-semibold text-ink-2">Starts</dt>
            <dd className="tabular">{formatDateTime(test.opensAt)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Icon.Clock className="h-3.5 w-3.5 shrink-0" />
            <dt className="font-semibold text-ink-2">Ends</dt>
            <dd className="tabular">{formatDateTime(test.closesAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
        {cancelled && (
          <div className="text-right">
            <Badge tone="error">Cancelled</Badge>
            {released && (
              <Link href={`/results/${test.id}`} className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-1" })}>
                View result
              </Link>
            )}
          </div>
        )}

        {!cancelled && window === "future" && (
          <Badge tone="neutral"><Icon.Lock className="h-3 w-3" /> Locked</Badge>
        )}

        {!cancelled && window === "open" && !submission && (
          <Link href={`/test/${test.id}`} className={buttonClasses({ className: "w-full sm:w-auto" })}>
            Start test
          </Link>
        )}

        {!cancelled && window === "open" && submitted && (
          <div className="text-right">
            <Badge tone="info">Submitted</Badge>
            <p className="mt-1 text-xs text-ink-3">
              {test.releaseAt ? `Results ${formatDateTime(test.releaseAt)}` : "Awaiting results"}
            </p>
          </div>
        )}

        {!cancelled && released && (
          <Link href={`/results/${test.id}`} className={buttonClasses({ variant: "secondary", className: "w-full sm:w-auto" })}>
            View result
          </Link>
        )}

        {!cancelled && window === "closed" && submitted && (
          <div className="text-right">
            <Badge tone="warning">{test.releaseAt ? "Results scheduled" : "Awaiting results"}</Badge>
            {test.releaseAt && <p className="mt-1 text-xs text-ink-3">{formatDateTime(test.releaseAt)}</p>}
          </div>
        )}

        {!cancelled && window === "closed" && !submission && (
          <div className="text-right">
            <Badge tone="neutral">Closed</Badge>
            <p className="mt-1 text-xs text-ink-3">Not attempted</p>
          </div>
        )}
      </div>
    </Card>
  );
}
