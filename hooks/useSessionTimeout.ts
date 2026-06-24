"use client";

import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "pointermove"] as const;

/**
 * Fires onTimeout after `timeoutMs` of no user activity. Used for the admin's
 * 30-minute idle session timeout. Any tracked interaction resets the clock.
 */
export function useSessionTimeout(
  onTimeout: () => void,
  timeoutMs: number,
  active: boolean,
) {
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!active) return;
    let timer = window.setTimeout(() => onTimeoutRef.current(), timeoutMs);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => onTimeoutRef.current(), timeoutMs);
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [timeoutMs, active]);
}
