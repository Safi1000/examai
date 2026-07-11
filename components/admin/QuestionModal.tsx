"use client";

import { useEffect, useState } from "react";
import type { QuestionCommon, QuestionType, QuestionVariant } from "@/types";
import { Modal, Button, Input, Textarea, Label, Checkbox, Select } from "@/components/ui";
import { useDatabase } from "@/lib/data/store";
import { RubricModal } from "@/components/admin/RubricModal";
import { cn } from "@/lib/cn";

/**
 * Question payload minus the test-only `order` / `id`; `subject` for bank items.
 * Written as a distributed intersection so the discriminated union on `type`
 * survives (a plain Omit<Question,…> would collapse it).
 */
export type QuestionDraft = Omit<QuestionCommon, "id"> & { subject?: string } & QuestionVariant;

const TYPE_LABEL: Record<QuestionType, string> = { mcq: "Multiple choice", text: "Written answer", photo: "Photo answer" };

export function QuestionModal({
  open,
  onClose,
  onSave,
  initial,
  withSubject,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (draft: QuestionDraft) => void;
  initial?: QuestionDraft | null;
  withSubject?: boolean;
}) {
  const [type, setType] = useState<QuestionType>("mcq");
  const [prompt, setPrompt] = useState("");
  const [topic, setTopic] = useState("");
  const [subject, setSubject] = useState("");
  const [marks, setMarks] = useState(2);
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [maxLength, setMaxLength] = useState(400);
  const [showCounter, setShowCounter] = useState(true);
  const [rubricId, setRubricId] = useState("");
  const [rubricModalOpen, setRubricModalOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const db = useDatabase();

  // Hydrate when (re)opened.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (initial) {
      setType(initial.type);
      setPrompt(initial.prompt);
      setTopic(initial.topic);
      setSubject(initial.subject ?? "");
      setMarks(initial.marks);
      if (initial.type === "mcq") {
        setOptions([...initial.options, "", "", "", ""].slice(0, 4));
        setCorrectIndex(initial.correctIndex);
      } else {
        setOptions(["", "", "", ""]);
        setCorrectIndex(0);
      }
      if (initial.type === "text") {
        setMaxLength(initial.maxLength ?? 400);
        setShowCounter(initial.showCounter ?? true);
        setRubricId(initial.rubricId ?? "");
      } else {
        setRubricId("");
      }
    } else {
      setType("mcq");
      setPrompt("");
      setTopic("");
      setSubject("");
      setMarks(2);
      setOptions(["", "", "", ""]);
      setCorrectIndex(0);
      setMaxLength(400);
      setShowCounter(true);
      setRubricId("");
    }
  }, [open, initial]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!prompt.trim()) e.prompt = "A question prompt is required.";
    if (!topic.trim()) e.topic = "Add a topic tag.";
    if (withSubject && !subject.trim()) e.subject = "Choose a subject.";
    if (marks < 1) e.marks = "Marks must be at least 1.";
    if (type === "mcq" && options.some((o) => !o.trim())) e.options = "Fill in all four options.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    const common = { prompt: prompt.trim(), topic: topic.trim(), marks, ...(withSubject ? { subject: subject.trim() } : {}) };
    let draft: QuestionDraft;
    if (type === "mcq") {
      draft = { ...common, type: "mcq", options: options.map((o) => o.trim()), correctIndex } as QuestionDraft;
    } else if (type === "text") {
      draft = {
        ...common,
        type: "text",
        maxLength,
        showCounter,
        ...(withSubject ? {} : { rubricId: rubricId || undefined }),
      } as QuestionDraft;
    } else {
      draft = { ...common, type: "photo" } as QuestionDraft;
    }
    onSave(draft);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Edit question" : "Add question"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>{initial ? "Save changes" : "Add question"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Question type</Label>
          <div className="grid grid-cols-3 gap-2">
            {(["mcq", "text", "photo"] as QuestionType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={
                  "rounded-md border px-2 py-2.5 text-xs font-semibold transition-colors " +
                  (type === t ? "border-brand bg-brand-soft text-brand" : "border-border-strong bg-surface text-ink-2 hover:bg-surface-2")
                }
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        {withSubject && (
          <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} error={errors.subject} placeholder="e.g. Mathematics" required />
        )}

        <Textarea label="Question prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} error={errors.prompt} placeholder="What are you asking?" required />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Topic tag" value={topic} onChange={(e) => setTopic(e.target.value)} error={errors.topic} placeholder="e.g. Algebra" required />
          <Input label="Marks" type="number" min={1} value={marks} onChange={(e) => setMarks(Number(e.target.value))} error={errors.marks} required />
        </div>

        {type === "mcq" && (
          <div>
            <Label>Options — select the correct one</Label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex min-h-[52px] items-center gap-3 rounded-md border px-4 py-2 transition-colors",
                    correctIndex === i ? "border-brand bg-brand-soft" : "border-border-strong bg-surface",
                  )}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={correctIndex === i}
                    aria-label={`Mark option ${i + 1} as correct`}
                    onClick={() => setCorrectIndex(i)}
                    className={cn(
                      "flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors",
                      correctIndex === i ? "border-brand" : "border-border-strong hover:border-brand/50",
                    )}
                  >
                    {correctIndex === i && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                  </button>
                  <input
                    value={opt}
                    onChange={(e) => setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                    placeholder={`Option ${i + 1}`}
                    className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
                    aria-label={`Option ${i + 1}`}
                  />
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-3">Tap the circle to mark the correct answer.</p>
            {errors.options && <p className="mt-1.5 text-sm font-medium text-error">{errors.options}</p>}
          </div>
        )}

        {type === "text" && (
          <>
            <div className="grid grid-cols-2 items-end gap-3">
              <Input label="Max length" type="number" min={50} value={maxLength} onChange={(e) => setMaxLength(Number(e.target.value))} />
              <div className="pb-3">
                <Checkbox checked={showCounter} onChange={setShowCounter} label="Show character counter" />
              </div>
            </div>
            {!withSubject && (
              <div>
                <div className="flex items-end gap-2">
                  <Select
                    label="Grading rubric (optional)"
                    value={rubricId}
                    onChange={(e) => setRubricId(e.target.value)}
                  >
                    <option value="">No rubric — grade with a single mark</option>
                    {db.rubrics.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </Select>
                  <Button type="button" variant="secondary" size="sm" className="mb-0.5 shrink-0" onClick={() => setRubricModalOpen(true)}>
                    New rubric
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-ink-3">
                  A rubric enables per-criterion grading and AI grade suggestions for this written answer.
                </p>
              </div>
            )}
          </>
        )}

        {type === "photo" && (
          <p className="rounded-md border border-border bg-surface-2/60 px-3 py-2.5 text-sm text-ink-2">
            Students will upload or photograph their handwritten working. Marked manually during grading.
          </p>
        )}
      </div>

      <RubricModal
        open={rubricModalOpen}
        onClose={() => setRubricModalOpen(false)}
        onSaved={(id) => setRubricId(id)}
      />
    </Modal>
  );
}
