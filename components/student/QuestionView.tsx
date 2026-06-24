"use client";

import { useRef, useState } from "react";
import type { Answer, Question } from "@/types";
import { RadioCard, Textarea, Pill, Badge, Button, Icon } from "@/components/ui";
import { uploadImage } from "@/lib/cloudinary";
import { useToast } from "@/components/toast";

/** Renders one question and its answer control (MCQ / Text / Photo). */
export function QuestionView({
  question,
  answer,
  onChange,
}: {
  question: Question;
  answer: Answer;
  onChange: (next: Answer) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{question.topic}</Badge>
        <Pill>{question.marks} {question.marks === 1 ? "mark" : "marks"}</Pill>
        <span className="text-xs uppercase tracking-wide text-ink-3">{question.type}</span>
      </div>
      <p className="mt-3 text-lg font-semibold leading-snug text-ink">{question.prompt}</p>

      <div className="mt-5">
        {question.type === "mcq" && (
          <fieldset className="space-y-2.5">
            <legend className="sr-only">{question.prompt}</legend>
            {question.options.map((opt, i) => (
              <RadioCard
                key={i}
                name={question.id}
                checked={answer.selectedIndex === i}
                onChange={() => onChange({ ...answer, selectedIndex: i })}
                label={opt}
              />
            ))}
          </fieldset>
        )}

        {question.type === "text" && (
          <div>
            <Textarea
              value={answer.text ?? ""}
              maxLength={question.maxLength}
              onChange={(e) => onChange({ ...answer, text: e.target.value })}
              placeholder="Write here..."
              aria-label="Your answer"
            />
            {question.showCounter && question.maxLength && (
              <p className="mt-1.5 text-right text-xs text-ink-3 tabular">
                {(answer.text ?? "").length} / {question.maxLength}
              </p>
            )}
          </div>
        )}

        {question.type === "photo" && <PhotoAnswer answer={answer} onChange={onChange} />}
      </div>
    </div>
  );
}

function PhotoAnswer({ answer, onChange }: { answer: Answer; onChange: (next: Answer) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Upload straight to Cloudinary; we persist the returned secure_url.
      const url = await uploadImage(file);
      onChange({ ...answer, photoDataUrl: url });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Photo upload failed. Try again.", "error");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        className="sr-only"
        aria-label="Upload a photo of your answer"
      />
      {answer.photoDataUrl ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={answer.photoDataUrl}
            alt="Your submitted answer"
            className="max-h-72 w-full rounded-lg border border-border object-contain bg-surface-2"
          />
          <Button variant="secondary" type="button" loading={uploading} onClick={() => inputRef.current?.click()}>
            <Icon.Camera className="h-4 w-4" /> Retake photo
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-strong bg-surface text-ink-2 transition-colors hover:border-brand hover:bg-brand-soft/40 disabled:opacity-60"
        >
          <Icon.Camera className="h-7 w-7" />
          <span className="text-sm font-semibold">{uploading ? "Uploading..." : "Take a photo or upload one"}</span>
          <span className="text-xs text-ink-3">Your handwritten working, please.</span>
        </button>
      )}
    </div>
  );
}
