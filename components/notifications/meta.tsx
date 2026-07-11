import { Icon } from "@/components/ui";

type Tone = "brand" | "success" | "warning" | "error" | "info" | "neutral";

interface TypeMeta {
  icon: React.ReactNode;
  tone: Tone;
}

/** Icon + semantic tone per notification type; unknown types fall back to a bell. */
const MAP: Record<string, TypeMeta> = {
  test_posted: { icon: <Icon.Doc />, tone: "brand" },
  test_updated: { icon: <Icon.Edit />, tone: "info" },
  test_deleted: { icon: <Icon.Trash />, tone: "error" },
  test_reminder: { icon: <Icon.Clock />, tone: "warning" },
  test_started: { icon: <Icon.Flag />, tone: "success" },
  test_closing: { icon: <Icon.Clock />, tone: "warning" },
  test_closed: { icon: <Icon.Lock />, tone: "neutral" },
  test_submitted: { icon: <Icon.Inbox />, tone: "info" },
  late_submission: { icon: <Icon.Warn />, tone: "warning" },
  notes_uploaded: { icon: <Icon.Doc />, tone: "brand" },
  notes_updated: { icon: <Icon.Edit />, tone: "info" },
  notes_deleted: { icon: <Icon.Trash />, tone: "neutral" },
  result_graded: { icon: <Icon.Check />, tone: "success" },
  result_released: { icon: <Icon.Award />, tone: "success" },
  announcement: { icon: <Icon.Megaphone />, tone: "info" },
  cohort_enrollment: { icon: <Icon.Users />, tone: "brand" },
  cohort_changed: { icon: <Icon.Users />, tone: "info" },
  integrity_report: { icon: <Icon.Flag />, tone: "warning" },
  grade_updated: { icon: <Icon.Chart />, tone: "info" },
  system: { icon: <Icon.Bell />, tone: "neutral" },
};

const FALLBACK: TypeMeta = { icon: <Icon.Bell />, tone: "neutral" };

export function typeMeta(type: string): TypeMeta {
  return MAP[type] ?? FALLBACK;
}

/** Tailwind classes for the tinted icon chip that leads each notification. */
export const toneChip: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  error: "bg-error-soft text-error",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-2 text-ink-2",
};

/** CTA verb per type (button label); null hides the CTA. */
export function ctaLabel(type: string): string | null {
  switch (type) {
    case "test_posted":
    case "test_updated":
    case "test_reminder":
    case "test_started":
    case "test_closing":
      return "Open Test";
    case "result_released":
    case "result_graded":
    case "grade_updated":
      return "View Result";
    case "notes_uploaded":
    case "notes_updated":
      return "View Notes";
    case "test_submitted":
    case "late_submission":
      return "Review Submission";
    default:
      return null;
  }
}
