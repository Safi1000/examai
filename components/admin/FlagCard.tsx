"use client";

/**
 * One student flag in the admin queue: what was flagged, who flagged it, the full
 * conversation, and the resolve action. A flag whose question (or test) has since
 * been deleted still renders — the prompt was snapshotted at flag time.
 *
 * The reply box is the shared FlagConversation, so a teacher reply lands in the
 * student's open panel over Realtime, and their follow-ups appear here the same
 * way — no refresh on either side.
 */
import { useState } from "react";
import type { QuestionFlag } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { messagesForFlag } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Icon } from "@/components/ui";
import { FlagConversation } from "@/components/flags/FlagConversation";
import { reasonLabel } from "@/components/flags/meta";
import { formatTimestamp } from "@/lib/time";

export function FlagCard({
  flag,
  studentName,
  testTitle,
  questionLabel,
  prompt,
  questionDeleted,
}: {
  flag: QuestionFlag;
  studentName: string;
  testTitle: string;
  /** "Q15" when the question is still in its test; "Question" otherwise. */
  questionLabel: string;
  prompt: string;
  questionDeleted: boolean;
}) {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);

  const resolved = flag.status === "resolved";
  const messages = messagesForFlag(db, flag.id);
  const replies = messages.filter((m) => m.sender === "admin").length;
  // An unanswered student turn is the thing a teacher actually needs to act on.
  const awaitingReply = !resolved && messages.at(-1)?.sender === "student";

  async function resolve() {
    setResolving(true);
    const ok = await store.resolveFlag(flag.id);
    setResolving(false);
    if (ok) toast("Flag resolved.", "success");
  }

  return (
    <Card ruled={!resolved} className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold capitalize text-ink">{studentName}</span>
            <span className="font-mono text-xs text-ink-3">{questionLabel}</span>
            <Badge tone="neutral">{reasonLabel(flag.reason)}</Badge>
            {resolved ? (
              <Badge tone="success"><Icon.Check className="h-3 w-3" /> Resolved</Badge>
            ) : awaitingReply ? (
              <Badge tone="error">Awaiting your reply</Badge>
            ) : (
              <Badge tone="warning">Open</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            {testTitle} · {formatTimestamp(flag.createdAt)} · {messages.length} message
            {messages.length === 1 ? "" : "s"}
            {replies > 0 && ` · ${replies} repl${replies === 1 ? "y" : "ies"}`}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
            <Icon.Megaphone className="h-4 w-4" /> {open ? "Hide" : "Conversation"}
          </Button>
          {!resolved && (
            <Button size="sm" onClick={resolve} loading={resolving}>
              <Icon.Check className="h-4 w-4" /> Resolve
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-border bg-surface-2/50 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          {questionDeleted ? "Question (deleted)" : "Question"}
        </p>
        <p className="mt-0.5 text-sm text-ink-2">{prompt}</p>
      </div>

      {open ? (
        <div className="mt-3">
          <FlagConversation
            flagId={flag.id}
            studentId={flag.studentId}
            viewer="admin"
            disabled={resolved}
            disabledNote="This flag is resolved. Reopen it by filing a new one."
          />
        </div>
      ) : (
        // Collapsed preview: the latest turn, so the queue stays scannable.
        <p className="mt-3 line-clamp-2 text-sm text-ink">
          <span className="font-semibold text-ink-3">
            {messages.at(-1)?.sender === "admin" ? "You: " : "Student: "}
          </span>
          {messages.at(-1)?.body ?? flag.message}
        </p>
      )}
    </Card>
  );
}
