"use client";

import { useEffect, useRef } from "react";
import type { Answer, Draft } from "@/types";

const draftKey = (studentId: string, testId: string) => `examia.draft.${studentId}.${testId}`;

export function loadDraft(studentId: string, testId: string): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(studentId, testId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function clearDraft(studentId: string, testId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey(studentId, testId));
}

/**
 * Debounced autosave of the in-progress test. Survives refresh; the runner
 * rehydrates from loadDraft() on mount.
 * TODO(rls): persist drafts to the backend so they survive device changes.
 */
export function useDraftAutosave(params: {
  studentId: string;
  testId: string;
  answers: Answer[];
  currentIndex: number;
  startedAt: string;
  enabled: boolean;
}) {
  const { studentId, testId, answers, currentIndex, startedAt, enabled } = params;
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const draft: Draft = {
        testId,
        studentId,
        answers,
        currentIndex,
        startedAt,
        savedAt: new Date().toISOString(),
      };
      try {
        window.localStorage.setItem(draftKey(studentId, testId), JSON.stringify(draft));
      } catch {
        /* ignore quota errors */
      }
    }, 400);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [studentId, testId, answers, currentIndex, startedAt, enabled]);
}
