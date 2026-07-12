"use client";

/**
 * The one place a student reports a problem with a question. Used from the test
 * runner (mid-test, no submission row yet) and from the released result
 * breakdown (submission known) — same component, same 250-char rule, so the two
 * entry points can never drift apart.
 *
 * Mount it only while open (QuestionFlagControl does): unmounting is what resets
 * the form, so the next question never inherits the last one's draft.
 */
import { useState } from "react";
import type { FlagReason, Question } from "@/types";
import { FLAG_MESSAGE_MAX, useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { Button, Modal, Select, Textarea } from "@/components/ui";
import { FLAG_REASONS } from "@/components/flags/meta";

export function QuestionFlagModal({
  open,
  onClose,
  question,
  studentId,
  testId,
  submissionId = null,
}: {
  open: boolean;
  onClose: () => void;
  question: Question;
  studentId: string;
  testId: string;
  /** Null mid-test: the submission doesn't exist yet. */
  submissionId?: string | null;
}) {
  const store = useStore();
  const { toast } = useToast();

  const [reason, setReason] = useState<FlagReason>("typo");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const trimmed = message.trim();
  const tooLong = message.length > FLAG_MESSAGE_MAX;
  const canSubmit = trimmed.length > 0 && !tooLong && !saving;

  async function submit() {
    if (!trimmed) {
      setError("Tell us what's wrong with the question.");
      return;
    }
    if (tooLong) {
      setError(`Keep it under ${FLAG_MESSAGE_MAX} characters.`);
      return;
    }
    setSaving(true);
    const ok = await store.addFlag({
      submissionId,
      questionId: question.id,
      questionPrompt: question.prompt,
      testId,
      studentId,
      reason,
      message: trimmed,
    });
    setSaving(false);
    if (!ok) {
      // The store already surfaced the reason through the error toast; keep the
      // modal open with the typed message intact so nothing is lost.
      setError("Couldn't send that. Check your connection and try again.");
      return;
    }
    toast("Flag submitted successfully", "success");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Flag this question"
      description="Tell your teacher what looks wrong. This won't affect your answer or your time."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={!canSubmit}>Create flag</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-surface-2/60 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Question</p>
          <p className="mt-0.5 line-clamp-3 text-sm text-ink">{question.prompt}</p>
        </div>

        <Select
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as FlagReason)}
        >
          {FLAG_REASONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </Select>

        <div>
          <Textarea
            label="Message"
            value={message}
            maxLength={FLAG_MESSAGE_MAX}
            onChange={(e) => { setMessage(e.target.value); setError(undefined); }}
            placeholder="What's the problem? Be specific…"
            error={error}
            required
          />
          <p className="mt-1 text-right text-xs text-ink-3 tabular">
            {message.length} / {FLAG_MESSAGE_MAX}
          </p>
        </div>
      </div>
    </Modal>
  );
}
