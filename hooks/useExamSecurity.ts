"use client";

/**
 * Exam integrity watchdog for the test runner.
 *
 * Watches for the ways a student can leave or exfiltrate an exam and reports each
 * one. It only DETECTS and REPORTS — the decision to lock is made server-side (a
 * trigger counts exam_violations and writes exam_locks), so nothing here is
 * load-bearing for security; a tampered client still can't submit while locked.
 *
 * There is deliberately NO fullscreen requirement: a web page cannot block OS
 * shortcuts (Alt+Tab, Cmd+Tab, the Windows key) anyway, so leaving the exam is
 * caught where it actually can be — focus and visibility.
 *
 * Rapid repeats of the same signal are coalesced: one physical action often fires
 * several DOM events (a tab switch raises both visibilitychange AND blur), so one
 * action logs one violation.
 */
import { useCallback, useEffect, useRef } from "react";
import type { ViolationType } from "@/types";

/**
 * Shortcuts that could copy the paper out, print/save it, or open devtools.
 * Ctrl/Cmd + C, V, X, A, U, P, S · F12 · Ctrl+Shift+I / J / C
 */
function blockedKey(e: KeyboardEvent): boolean {
  if (e.key === "F12") return true;
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl) return false;
  const k = e.key.toLowerCase();
  if (e.shiftKey && ["i", "j", "c"].includes(k)) return true; // devtools
  return ["c", "v", "x", "a", "u", "p", "s"].includes(k);
}

export function useExamSecurity({
  enabled,
  onViolation,
}: {
  enabled: boolean;
  onViolation: (type: ViolationType) => void;
}) {
  const lastRef = useRef<{ type: ViolationType; at: number } | null>(null);

  const report = useCallback(
    (type: ViolationType) => {
      const now = Date.now();
      const last = lastRef.current;
      if (last && last.type === type && now - last.at < 1500) return;
      lastRef.current = { type, at: now };
      onViolation(type);
    },
    [onViolation],
  );

  useEffect(() => {
    if (!enabled) return;

    const onVisibility = () => { if (document.hidden) report("tab_switch"); };
    const onBlur = () => report("window_blur");
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); report("copy"); };
    const onPaste = (e: ClipboardEvent) => { e.preventDefault(); report("paste"); };
    const onCut = (e: ClipboardEvent) => { e.preventDefault(); report("cut"); };
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); report("right_click"); };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!blockedKey(e)) return;
      e.preventDefault();
      report("blocked_shortcut");
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled, report]);
}
