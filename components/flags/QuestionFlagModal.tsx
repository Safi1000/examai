"use client";

/**
 * The student's flag panel — a conversation, not a fire-and-forget form.
 *
 * Two modes in one dialog:
 *   1. No thread yet  → reason + opening message. Sending CREATES the flag and
 *      immediately switches this same dialog into chat mode. It does NOT close,
 *      does not navigate, and does not touch the exam or its timer.
 *   2. Thread exists  → chat: full history + a composer for follow-ups. Teacher
 *      replies stream in over Realtime while it stays open.
 *
 * The dialog only ever closes when the student explicitly closes it.
 */
import { useState } from "react";
import type { FlagReason, Question, QuestionFlag } from "@/types";
import { FLAG_MESSAGE_MAX, useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { Badge, Button, Icon, Modal, Select, Textarea } from "@/components/ui";
import { FLAG_REASONS, reasonLabel } from "@/components/flags/meta";
import { FlagConversation } from "@/components/flags/FlagConversation";

export function QuestionFlagModal({
  open,
  onClose,
  question,
  studentId,
  testId,
  submissionId = null,
  existingFlag = null,
}: {
  open: boolean;
  onClose: () => void;
  question: Question;
  studentId: string;
  testId: string;
  /** Null mid-test: the submission doesn't exist yet. */
  submissionId?: string | null;
  /** When set, open straight into the conversation for this flag. */
  existingFlag?: QuestionFlag | null;
}) {
  const store = useStore();
  const { toast } = useToast();

  // Once a flag exists (pre-existing, or just created here), we're in chat mode.
  const [flagId, setFlagId] = useState<string | null>(existingFlag?.id ?? null);
  const [reason, setReason] = useState<FlagReason>(existingFlag?.reason ?? "typo");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const resolved = existingFlag?.status === "resolved";
  const trimmed = message.trim();
  const tooLong = message.length > FLAG_MESSAGE_MAX;
  const canSubmit = trimmed.length > 0 && !tooLong && !saving;

  async function createFlag() {
    if (!trimmed) {
      setError("Tell us what's wrong with the question.");
      return;
    }
    if (tooLong) {
      setError(`Keep it under ${FLAG_MESSAGE_MAX} characters.`);
      return;
    }
    setSaving(true);
    const newId = await store.addFlag({
      submissionId,
      questionId: question.id,
      questionPrompt: question.prompt,
      testId,
      studentId,
      reason,
      message: trimmed,
    });
    setSaving(false);
    if (!newId) {
      // Keep the dialog open with the typed message intact so nothing is lost.
      setError("Couldn't send that. Check your connection and try again.");
      return;
    }
    toast("Your message has been sent to the teacher.", "success");
    setMessage(""); // clear only the input
    setFlagId(newId); // stay open — slide into the conversation
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={flagId ? "Your conversation" : "Flag this question"}
      description={
        flagId
          ? "Your teacher will reply here. You can keep asking follow-ups — this won't affect your answer or your time."
          : "Tell your teacher what looks wrong. This won't affect your answer or your time."
      }
      footer={
        flagId ? (
          <Button variant="secondary" onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={createFlag} loading={saving} disabled={!canSubmit}>Send</Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-surface-2/60 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Question</p>
          <p className="mt-0.5 line-clamp-3 text-sm text-ink">{question.prompt}</p>
        </div>

        {flagId ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{reasonLabel(existingFlag?.reason ?? reason)}</Badge>
              {resolved ? (
                <Badge tone="success"><Icon.Check className="h-3 w-3" /> Resolved</Badge>
              ) : (
                <Badge tone="warning">Open</Badge>
              )}
            </div>

            <FlagConversation
              flagId={flagId}
              studentId={studentId}
              viewer="student"
              disabled={resolved}
              disabledNote="Your teacher marked this resolved. The history stays here."
            />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </Modal>
  );
}
