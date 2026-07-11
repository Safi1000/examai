"use client";

import { useStore } from "@/lib/data/store";
import { Card, Icon } from "@/components/ui";
import { useCountdown } from "@/hooks/useCountdown";
import { formatCountdown } from "@/lib/time";

/**
 * Shown when a student has submitted but results aren't released yet AND the
 * test has a scheduled release time. Displays the release date/time and a live
 * countdown. Release itself happens server-side (pg_cron) — when the countdown
 * hits zero we re-hydrate the store so the freshly-released result shows through.
 */
export function ResultPending({ releaseAt }: { releaseAt: string }) {
  const store = useStore();
  const endMs = new Date(releaseAt).getTime();
  const { remaining, expired } = useCountdown(Number.isNaN(endMs) ? null : endMs, () => {
    // Give the scheduler a moment, then refresh from the server.
    setTimeout(() => void store.load(), 3000);
  });

  const d = new Date(releaseAt);
  const dateLabel = d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const timeLabel = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <Card ruled className="mt-4 animate-fade-up p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning" aria-hidden>
        <Icon.Clock className="h-6 w-6" />
      </div>
      <h1 className="mt-3 text-xl font-extrabold tracking-tight text-ink">Result Pending</h1>

      {expired ? (
        <p className="mt-1 text-sm text-ink-2">Releasing now — hang tight…</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-2">Your result will be released on</p>
          <p className="mt-2 font-display text-2xl font-extrabold text-ink">{dateLabel}</p>
          <p className="font-mono text-lg text-ink-2">{timeLabel}</p>

          <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface-2 px-4 py-2">
            <Icon.Clock className="h-4 w-4 text-ink-3" />
            <span className="font-mono text-xl font-bold tabular text-ink">{formatCountdown(remaining)}</span>
          </div>
          <p className="mt-3 text-xs text-ink-3">Results release automatically — no need to keep this page open.</p>
        </>
      )}
    </Card>
  );
}
