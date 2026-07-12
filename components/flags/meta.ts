import type { FlagReason } from "@/types";

/** The four things a student can report, in the order the dropdown offers them. */
export const FLAG_REASONS: { value: FlagReason; label: string }[] = [
  { value: "typo", label: "Typo" },
  { value: "ambiguous", label: "Ambiguous" },
  { value: "technical", label: "Technical issue" },
  { value: "other", label: "Other" },
];

export const reasonLabel = (reason: FlagReason): string =>
  FLAG_REASONS.find((r) => r.value === reason)?.label ?? reason;
