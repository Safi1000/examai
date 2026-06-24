"use client";

import { useCallback, useEffect, useState } from "react";

interface LockoutState {
  fails: number;
  lockLevel: number;
  lockedUntil: number; // epoch ms, 0 = not locked
}

const ZERO: LockoutState = { fails: 0, lockLevel: 0, lockedUntil: 0 };
const THRESHOLD = 5; // fails before a lock
const BASE_SECONDS = 30; // first lock
const CAP_SECONDS = 10 * 60; // 10 minutes

/**
 * Escalating brute-force lockout for the admin login: 5 fails → 30s, then 60s,
 * 120s, … doubling, capped at 10 minutes. Persists across refresh.
 */
export function useLockout(storageKey: string) {
  const read = (): LockoutState => {
    if (typeof window === "undefined") return ZERO;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as LockoutState) : ZERO;
    } catch {
      return ZERO;
    }
  };

  const [state, setState] = useState<LockoutState>(read);
  const [now, setNow] = useState<number>(() => Date.now());

  const write = useCallback(
    (next: LockoutState) => {
      setState(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const isLocked = state.lockedUntil > now;

  // Tick only while locked, to update the countdown.
  useEffect(() => {
    if (!isLocked) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [isLocked]);

  const registerFailure = useCallback(() => {
    const fails = state.fails + 1;
    if (fails >= THRESHOLD) {
      const lockLevel = state.lockLevel + 1;
      const seconds = Math.min(BASE_SECONDS * 2 ** (lockLevel - 1), CAP_SECONDS);
      write({ fails: 0, lockLevel, lockedUntil: Date.now() + seconds * 1000 });
    } else {
      write({ ...state, fails });
    }
  }, [state, write]);

  const reset = useCallback(() => write(ZERO), [write]);

  const remainingSeconds = isLocked ? Math.ceil((state.lockedUntil - now) / 1000) : 0;
  const attemptsLeft = Math.max(0, THRESHOLD - state.fails);

  return { isLocked, remainingSeconds, attemptsLeft, registerFailure, reset };
}
