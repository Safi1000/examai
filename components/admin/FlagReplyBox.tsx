"use client";

/**
 * Admin reply editor for one flag. Same 250-char rule as an announcement (and as
 * the student's own message); the DB enforces it too. Replying again overwrites
 * the previous reply — the student always sees the latest one.
 */
import { useState } from "react";
import { FLAG_MESSAGE_MAX, useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { Button, Textarea } from "@/components/ui";

export function FlagReplyBox({
  flagId,
  initialReply,
  onDone,
}: {
  flagId: string;
  initialReply?: string;
  onDone: () => void;
}) {
  const store = useStore();
  const { toast } = useToast();
  const [reply, setReply] = useState(initialReply ?? "");
  const [saving, setSaving] = useState(false);

  const trimmed = reply.trim();
  const canSend = trimmed.length > 0 && reply.length <= FLAG_MESSAGE_MAX && !saving;

  async function send() {
    setSaving(true);
    const ok = await store.replyToFlag(flagId, trimmed);
    setSaving(false);
    if (!ok) return; // the store already toasted the failure and rolled back
    toast(initialReply ? "Reply updated." : "Reply sent.", "success");
    onDone();
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-surface-2/40 p-3">
      <Textarea
        label="Reply to the student"
        value={reply}
        maxLength={FLAG_MESSAGE_MAX}
        onChange={(e) => setReply(e.target.value)}
        placeholder="Explain what you've done about it…"
        autoFocus
      />
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-3 tabular">{reply.length} / {FLAG_MESSAGE_MAX}</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onDone} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={send} loading={saving} disabled={!canSend}>
            {initialReply ? "Update reply" : "Send reply"}
          </Button>
        </div>
      </div>
    </div>
  );
}
