"use client";

import { useEffect, useState } from "react";
import type { Rubric, RubricCriterion } from "@/types";
import { useStore } from "@/lib/data/store";
import { Modal, Button, Input, Textarea, Label, Icon } from "@/components/ui";

/** Blank criterion with a fresh id. */
function blankCriterion(): RubricCriterion {
  return { id: crypto.randomUUID(), label: "", description: "", maxPoints: 2 };
}

/**
 * Build or edit a reusable rubric. A criterion is a CONCEPT the student must
 * demonstrate (the `description` guides the AI's judgment) — not a model answer.
 */
export function RubricModal({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  initial?: Rubric | null;
}) {
  const store = useStore();
  const [name, setName] = useState("");
  const [criteria, setCriteria] = useState<RubricCriterion[]>([blankCriterion()]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (initial) {
      setName(initial.name);
      setCriteria(initial.criteria.length ? initial.criteria.map((c) => ({ ...c })) : [blankCriterion()]);
    } else {
      setName("");
      setCriteria([blankCriterion()]);
    }
  }, [open, initial]);

  function patch(id: string, next: Partial<RubricCriterion>) {
    setCriteria((cs) => cs.map((c) => (c.id === id ? { ...c, ...next } : c)));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Give the rubric a name.";
    if (criteria.length === 0) e.criteria = "Add at least one criterion.";
    criteria.forEach((c) => {
      if (!c.label.trim()) e[`label_${c.id}`] = "Describe the concept to assess.";
      if (c.maxPoints < 1) e[`points_${c.id}`] = "Points must be at least 1.";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    const clean: RubricCriterion[] = criteria.map((c) => ({
      id: c.id,
      label: c.label.trim(),
      description: c.description?.trim() || undefined,
      maxPoints: c.maxPoints,
    }));
    if (initial) {
      store.updateRubric(initial.id, { name: name.trim(), criteria: clean });
      onSaved?.(initial.id);
    } else {
      const id = store.addRubric(name.trim(), clean);
      onSaved?.(id);
    }
    onClose();
  }

  const totalPoints = criteria.reduce((s, c) => s + (c.maxPoints || 0), 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Edit rubric" : "New rubric"}
      description="Each criterion is a concept to look for — the student can phrase it any way."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>{initial ? "Save rubric" : "Create rubric"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Rubric name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          placeholder="e.g. Photosynthesis — light dependence"
          required
        />

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label>Criteria</Label>
            <span className="font-mono text-xs text-ink-3">{totalPoints} pts total</span>
          </div>
          {errors.criteria && <p className="mb-2 text-sm font-medium text-error">{errors.criteria}</p>}

          <div className="space-y-3">
            {criteria.map((c, i) => (
              <div key={c.id} className="rounded-md border border-border bg-surface-2/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs text-ink-3">Criterion {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => setCriteria((cs) => cs.filter((x) => x.id !== c.id))}
                    disabled={criteria.length === 1}
                    className="flex h-7 w-7 items-center justify-center rounded text-ink-3 hover:bg-error-soft hover:text-error disabled:opacity-30"
                    aria-label={`Remove criterion ${i + 1}`}
                  >
                    <Icon.Trash className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  <Input
                    label="Concept (label)"
                    value={c.label}
                    onChange={(e) => patch(c.id, { label: e.target.value })}
                    error={errors[`label_${c.id}`]}
                    placeholder="e.g. Explains why light is required"
                  />
                  <Textarea
                    label="Guidance for the grader (optional)"
                    value={c.description ?? ""}
                    onChange={(e) => patch(c.id, { description: e.target.value })}
                    placeholder="What demonstrates this concept? Nuances, common partial answers…"
                    className="min-h-16"
                  />
                  <div className="w-32">
                    <Input
                      label="Max points"
                      type="number"
                      min={1}
                      value={c.maxPoints}
                      onChange={(e) => patch(c.id, { maxPoints: Number(e.target.value) })}
                      error={errors[`points_${c.id}`]}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setCriteria((cs) => [...cs, blankCriterion()])}
          >
            <Icon.Plus className="h-4 w-4" /> Add criterion
          </Button>
        </div>
      </div>
    </Modal>
  );
}
