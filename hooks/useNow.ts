"use client";

import { useEffect, useState } from "react";

/**
 * A coarse ticking clock for schedule-derived UI (test status badges, windows).
 * Re-renders every `intervalMs` so time-based state (scheduled → active → closed)
 * updates on its own — no browser refresh, and no DB polling. Default 30s is
 * plenty for minute-granularity schedules and cheap on renders.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
