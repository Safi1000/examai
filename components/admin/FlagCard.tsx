"use client";

/**
 * One student flag in the admin queue: what was flagged, who flagged it, what
 * they said, and the reply/resolve actions. A flag whose question (or test) has
 * since been deleted still renders — the prompt was snapshotted at flag time.
 */
import { useState } from "react";
import type { QuestionFlag } from "@/types";
import { useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Icon } from "@/components/ui";
import { FlagReplyBox } from "@/components/admin/FlagReplyBox";
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
  const store = useStore();
  const { toast } = useToast();
  const [replying, setReplying] = useState(false);
  const [resolving, setResolving] = useState(false);

  const resolved = flag.status === "resolved";

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
            ) : (
              <Badge tone="warning">Open</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            {testTitle} · {formatTimestamp(flag.createdAt)}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" onClick={() => setReplying((r) => !r)}>
            <Icon.Edit className="h-4 w-4" /> {flag.adminReply ? "Edit reply" : "Reply"}
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

      <p className="mt-3 text-sm text-ink">{flag.message}</p>

      {flag.adminReply && !replying && (
        <div className="mt-3 rounded-md border border-info/30 bg-info-soft/60 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-info">Your reply</p>
          <p className="mt-0.5 text-sm text-ink">{flag.adminReply}</p>
        </div>
      )}

      {replying && (
        <FlagReplyBox
          flagId={flag.id}
          initialReply={flag.adminReply}
          onDone={() => setReplying(false)}
        />
      )}
    </Card>
  );
}
