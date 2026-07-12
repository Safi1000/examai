"use client";

/**
 * The two-way conversation on one flag — used by BOTH sides (the student's panel
 * during/after the exam, and the admin queue), so the two can never drift apart.
 *
 * Sending never closes anything and never navigates: it appends the turn, clears
 * ONLY the input, and confirms. The other side's reply arrives over Realtime
 * (useRealtimeSync → store.refreshFlagMessage), so no polling and no refresh.
 */
import { useEffect, useRef, useState } from "react";
import type { FlagSender } from "@/types";
import { FLAG_MESSAGE_MAX, useDatabase, useStore } from "@/lib/data/store";
import { messagesForFlag } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { Button, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/time";

export function FlagConversation({
  flagId,
  studentId,
  viewer,
  disabled = false,
  disabledNote,
}: {
  flagId: string;
  studentId: string;
  /** Whose side we're rendering for — drives bubble alignment and who authors. */
  viewer: FlagSender;
  /** e.g. a resolved flag: history stays readable, the composer goes away. */
  disabled?: boolean;
  disabledNote?: string;
}) {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();

  const messages = messagesForFlag(db, flagId);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as replies stream in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const trimmed = body.trim();
  const canSend = trimmed.length > 0 && body.length <= FLAG_MESSAGE_MAX && !sending && !disabled;

  async function send() {
    if (!canSend) return;
    setSending(true);
    const ok =
      viewer === "admin"
        ? await store.replyToFlag(flagId, trimmed)
        : await store.sendFlagMessage(flagId, studentId, trimmed);
    setSending(false);
    if (!ok) return; // the store already surfaced the failure and rolled back
    setBody(""); // clear ONLY the input — the panel stays exactly as it is
    toast(
      viewer === "admin"
        ? "Reply sent to the student."
        : "Your message has been sent to the teacher.",
      "success",
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      {/* Transcript */}
      <div className="max-h-64 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border border-border bg-surface-2/40 p-3">
        {messages.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-ink-3">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender === viewer;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-lg px-3 py-2", mine ? "bg-brand text-on-brand" : "bg-surface text-ink border border-border")}>
                  <p className={cn("text-[10px] font-semibold uppercase tracking-wide", mine ? "text-on-brand/70" : "text-ink-3")}>
                    {m.sender === "admin" ? "Teacher" : "Student"} · {timeAgo(m.createdAt)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{m.body}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Composer — stays put after every send */}
      {disabled ? (
        <p className="mt-2 text-center text-xs italic text-ink-3">{disabledNote ?? "This conversation is closed."}</p>
      ) : (
        <div className="mt-3">
          <Textarea
            label={viewer === "admin" ? "Reply to the student" : "Message your teacher"}
            value={body}
            maxLength={FLAG_MESSAGE_MAX}
            onChange={(e) => setBody(e.target.value)}
            placeholder={viewer === "admin" ? "Explain what you've done about it…" : "Ask a follow-up…"}
            rows={2}
          />
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-xs text-ink-3 tabular">{body.length} / {FLAG_MESSAGE_MAX}</p>
            <Button size="sm" onClick={send} loading={sending} disabled={!canSend}>Send</Button>
          </div>
        </div>
      )}
    </div>
  );
}
