"use client";

import { useEffect, useRef, useState } from "react";
import { timerState, type TimerState } from "@/lib/time";

/**
 * Ticks once a second toward an absolute end time. Remaining is recomputed from
 * the wall clock each tick, so it stays correct after a backgrounded tab.
 */
export function useCountdown(endMs: number | null, onExpire?: () => void) {
  const compute = () => (endMs == null ? 0 : Math.max(0, Math.round((endMs - Date.now()) / 1000)));
  const [remaining, setRemaining] = useState<number>(compute);
  const firedRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    firedRef.current = false;
    if (endMs == null) return;

    const tick = () => {
      const next = Math.max(0, Math.round((endMs - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [endMs]);

  const state: TimerState = remaining <= 0 ? "critical" : timerState(remaining);
  return { remaining, state, expired: remaining <= 0 };
}
