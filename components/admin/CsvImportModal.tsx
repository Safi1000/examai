"use client";

/**
 * Bulk roster import (Feature 3).
 *
 * A four-step flow inside one modal:
 *   select → preview → importing → summary
 *
 * The CSV is parsed and validated entirely client-side (lib/csv-parser +
 * lib/import-validation); only the selected, valid rows are then handed to
 * store.bulkAddStudents, which provisions them through the admin-only
 * `admin-users` edge function. The frontend never touches Supabase Auth or the
 * students table directly — that security seam is preserved.
 */
import { useMemo, useRef, useState } from "react";
import { useDatabase, useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { parseCsv, CsvParseError } from "@/lib/csv-parser";
import { validateImport, type ValidatedRow } from "@/lib/import-validation";
import { Button, Modal, Badge, Table, TableScroll, Th, Td, Icon, Pill, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";

type Step = "select" | "preview" | "importing" | "summary";

interface ImportOutcome {
  username: string;
  status: "created" | "failed";
  reason?: string;
}

/** The template we hand admins — mirrors the friendly header set the parser accepts. */
const TEMPLATE_CSV = "username,email,cohort\njohn123,john@example.com,BSCS-2026\nalex456,alex@example.com,BSCS-2027\n";

function StatusBadge({ row }: { row: ValidatedRow }) {
  if (row.valid) {
    return <Badge tone="success"><Icon.Check className="h-3.5 w-3.5" /> Valid</Badge>;
  }
  // Surface the first problem as the badge; the rest sit in the row's tooltip/list.
  return <Badge tone="error"><Icon.Warn className="h-3.5 w-3.5" /> {row.errors[0]}</Badge>;
}

export function CsvImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("select");
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<ValidatedRow[]>([]);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  // Selected valid rows (by source line). Invalid rows are never selectable.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const [showDetail, setShowDetail] = useState<"created" | "failed" | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const valid = rows.filter((r) => r.valid).length;
    return { total: rows.length, valid, errors: rows.length - valid };
  }, [rows]);

  function reset() {
    setStep("select");
    setFileName("");
    setParseError(null);
    setRows([]);
    setMissingColumns([]);
    setSelected(new Set());
    setProgress({ done: 0, total: 0 });
    setOutcomes([]);
    setShowDetail(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    if (step === "importing") return; // don't allow closing mid-import
    reset();
    onClose();
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      const result = validateImport(parsed, db.students, db.cohorts);
      if (result.missingColumns.length > 0) {
        setMissingColumns(result.missingColumns);
        setRows([]);
        setStep("preview");
        return;
      }
      setMissingColumns([]);
      setRows(result.rows);
      // Pre-select every valid row.
      setSelected(new Set(result.rows.filter((r) => r.valid).map((r) => r.line)));
      setStep("preview");
    } catch (err) {
      setParseError(err instanceof CsvParseError ? err.message : "Could not read this file. Make sure it's a valid CSV.");
      setStep("select");
    } finally {
      // Allow re-picking the same file after a reset.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleRow(line: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  }
  function toggleAll() {
    const validLines = rows.filter((r) => r.valid).map((r) => r.line);
    const allSelected = validLines.every((l) => selected.has(l));
    setSelected(allSelected ? new Set() : new Set(validLines));
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roster-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runImport() {
    const toImport = rows.filter((r) => r.valid && selected.has(r.line) && r.cohortId);
    if (toImport.length === 0) {
      toast("No valid rows selected to import.", "error");
      return;
    }
    setStep("importing");
    setProgress({ done: 0, total: toImport.length });

    const results = await store.bulkAddStudents(
      toImport.map((r) => ({
        username: r.username,
        email: r.email || undefined,
        cohortId: r.cohortId!,
        password: r.password,
      })),
      (done, total) => setProgress({ done, total }),
    );

    setOutcomes(results);
    setStep("summary");
    const created = results.filter((r) => r.status === "created").length;
    toast(`Imported ${created} student${created === 1 ? "" : "s"}.`, created > 0 ? "success" : "error");
  }

  // --- Derived summary numbers ---
  const createdOutcomes = outcomes.filter((o) => o.status === "created");
  const failedOutcomes = outcomes.filter((o) => o.status === "failed");
  const attempted = outcomes.length;
  const skipped = counts.total - attempted; // invalid + deselected rows
  // Map created usernames back to their temp password for the credentials list.
  const passwordByUsername = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.username.toLowerCase(), r.password));
    return m;
  }, [rows]);

  const allValidSelected =
    counts.valid > 0 && rows.filter((r) => r.valid).every((r) => selected.has(r.line));

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import students from CSV"
      description={
        step === "select"
          ? "Upload a CSV to add many students at once."
          : step === "preview"
            ? fileName
            : undefined
      }
      size="lg"
      footer={
        step === "preview" && missingColumns.length === 0 ? (
          <>
            <Button variant="secondary" onClick={reset}>Choose another file</Button>
            <Button onClick={runImport} disabled={selected.size === 0}>
              Import {selected.size} student{selected.size === 1 ? "" : "s"}
            </Button>
          </>
        ) : step === "summary" ? (
          <Button onClick={handleClose}>Done</Button>
        ) : step === "preview" && missingColumns.length > 0 ? (
          <Button variant="secondary" onClick={reset}>Choose another file</Button>
        ) : undefined
      }
    >
      {/* -------------------------------------------------- SELECT */}
      {step === "select" && (
        <div className="space-y-5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFilePicked}
            className="sr-only"
            aria-label="Choose CSV file"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border-strong bg-surface-2 px-6 py-10 text-center transition-colors hover:border-brand hover:bg-brand-soft/40"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
              <Icon.Download className="h-6 w-6 rotate-180" />
            </span>
            <span className="font-semibold text-ink">Click to choose a CSV file</span>
            <span className="text-sm text-ink-3">or drag it onto this window</span>
          </button>

          {parseError && (
            <p className="rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm font-medium text-error">
              {parseError}
            </p>
          )}

          <div className="rounded-lg border border-border bg-paper/50 px-4 py-3 text-sm text-ink-2">
            <p className="mb-1 font-semibold text-ink">Expected columns</p>
            <p className="mb-2">
              <Pill>username</Pill> <span className="text-ink-3">·</span> <Pill>email</Pill>{" "}
              <span className="text-ink-3">(optional)</span> <span className="text-ink-3">·</span>{" "}
              <Pill>cohort</Pill>
            </p>
            <p className="text-ink-3">
              Cohort matches a cohort name (e.g. {db.cohorts[0]?.name ?? "BSCS-2026"}) or its id. An
              exported roster imports back as-is.
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
            >
              <Icon.Download className="h-4 w-4" /> Download template
            </button>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- PREVIEW (missing columns) */}
      {step === "preview" && missingColumns.length > 0 && (
        <div className="rounded-md border border-error/30 bg-error-soft px-4 py-3 text-sm text-error">
          <p className="font-semibold">This file is missing required columns:</p>
          <ul className="mt-1 list-inside list-disc">
            {missingColumns.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="mt-2 text-error/90">Add the column header(s) and try again.</p>
        </div>
      )}

      {/* -------------------------------------------------- PREVIEW (table) */}
      {step === "preview" && missingColumns.length === 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">Total {counts.total}</Badge>
            <Badge tone="success">Valid {counts.valid}</Badge>
            <Badge tone={counts.errors > 0 ? "error" : "neutral"}>Errors {counts.errors}</Badge>
          </div>

          {counts.errors > 0 && (
            <p className="text-sm text-ink-2">
              Invalid rows are highlighted and can&apos;t be selected. Fix them in your file and
              re-upload, or import just the valid rows.
            </p>
          )}

          <TableScroll className="max-h-[46vh] overflow-y-auto rounded-lg border border-border">
            <Table stickyFirst>
              <thead className="sticky top-0 z-10 bg-paper">
                <tr>
                  <Th className="w-10">
                    <input
                      type="checkbox"
                      checked={allValidSelected}
                      onChange={toggleAll}
                      aria-label="Select all valid rows"
                      disabled={counts.valid === 0}
                    />
                  </Th>
                  <Th className="w-14">Row</Th>
                  <Th>Username</Th>
                  <Th>Email</Th>
                  <Th>Cohort</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className={cn(!r.valid && "bg-error-soft/40")}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={selected.has(r.line)}
                        onChange={() => toggleRow(r.line)}
                        disabled={!r.valid}
                        aria-label={`Select row ${r.line}`}
                      />
                    </Td>
                    <Td className="font-mono text-xs text-ink-3">{r.line}</Td>
                    <Td className="font-semibold text-ink">{r.username || <span className="text-ink-3">—</span>}</Td>
                    <Td className="text-ink-2">{r.email || <span className="text-ink-3">—</span>}</Td>
                    <Td className="text-ink-2">{r.cohortInput || <span className="text-ink-3">—</span>}</Td>
                    <Td>
                      <StatusBadge row={r} />
                      {r.errors.length > 1 && (
                        <span className="mt-1 block text-xs text-error">{r.errors.slice(1).join(" · ")}</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        </div>
      )}

      {/* -------------------------------------------------- IMPORTING */}
      {step === "importing" && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <Spinner size={32} className="text-brand" />
          <div>
            <p className="font-semibold text-ink">Importing students…</p>
            <p className="mt-1 font-mono text-sm text-ink-2">
              Creating {progress.done}/{progress.total}
            </p>
          </div>
          <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-300"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-ink-3">Please keep this window open.</p>
        </div>
      )}

      {/* -------------------------------------------------- SUMMARY */}
      {step === "summary" && (
        <div className="space-y-5">
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
              <Icon.Check className="h-6 w-6" />
            </span>
            <p className="mt-2 text-lg font-bold text-ink">Import finished</p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-border bg-surface-2 px-2 py-3">
              <p className="font-display text-2xl font-bold text-success">{createdOutcomes.length}</p>
              <p className="text-xs font-semibold text-ink-2">Created</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2 px-2 py-3">
              <p className="font-display text-2xl font-bold text-ink-2">{skipped}</p>
              <p className="text-xs font-semibold text-ink-2">Skipped</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2 px-2 py-3">
              <p className="font-display text-2xl font-bold text-error">{failedOutcomes.length}</p>
              <p className="text-xs font-semibold text-ink-2">Failed</p>
            </div>
          </div>

          {skipped > 0 && (
            <p className="text-center text-xs text-ink-3">
              Skipped = invalid or unselected rows that were never sent.
            </p>
          )}

          {/* Created — expandable, with the temp passwords to distribute. */}
          {createdOutcomes.length > 0 && (
            <div className="rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setShowDetail(showDetail === "created" ? null : "created")}
                className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold text-ink"
              >
                <span>Created accounts ({createdOutcomes.length})</span>
                <Icon.ChevronRight className={cn("h-4 w-4 transition-transform", showDetail === "created" && "rotate-90")} />
              </button>
              {showDetail === "created" && (
                <div className="max-h-48 overflow-y-auto border-t border-border px-4 py-2">
                  <p className="mb-2 text-xs text-ink-3">Share each student their temporary password for first sign-in.</p>
                  <ul className="space-y-1 text-sm">
                    {createdOutcomes.map((o) => (
                      <li key={o.username} className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink">{o.username}</span>
                        <Pill>{passwordByUsername.get(o.username.toLowerCase()) ?? "—"}</Pill>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Failed — expandable, with reasons. */}
          {failedOutcomes.length > 0 && (
            <div className="rounded-lg border border-error/30">
              <button
                type="button"
                onClick={() => setShowDetail(showDetail === "failed" ? null : "failed")}
                className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold text-error"
              >
                <span>Failed ({failedOutcomes.length})</span>
                <Icon.ChevronRight className={cn("h-4 w-4 transition-transform", showDetail === "failed" && "rotate-90")} />
              </button>
              {showDetail === "failed" && (
                <div className="max-h-48 overflow-y-auto border-t border-error/30 px-4 py-2">
                  <ul className="space-y-1 text-sm">
                    {failedOutcomes.map((o, i) => (
                      <li key={`${o.username}-${i}`} className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink">{o.username || "(no username)"}</span>
                        <span className="text-xs text-error">{o.reason ?? "failed"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
