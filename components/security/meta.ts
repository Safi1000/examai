import type { ViolationType } from "@/types";

/** Human wording for each violation, shared by the lock screen and admin console. */
export const VIOLATION_LABEL: Record<ViolationType, string> = {
  tab_switch: "Switched tab",
  window_blur: "Left the exam window",
  fullscreen_exit: "Exited fullscreen",
  copy: "Attempted to copy",
  paste: "Attempted to paste",
  cut: "Attempted to cut",
  right_click: "Right-clicked",
  blocked_shortcut: "Used a blocked shortcut",
};
