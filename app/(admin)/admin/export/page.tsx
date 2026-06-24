"use client";

import { useState } from "react";
import { useDatabase } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Button, Checkbox, Badge, Icon } from "@/components/ui";
import { COMPANY_SLUG } from "@/lib/config";
import {
  buildExport,
  entityCount,
  entityRows,
  exportFilename,
  toCsv,
  TABULAR,
  ENTITY_LABEL,
  type EntityKey,
} from "@/lib/export";

const ALL: EntityKey[] = ["cohorts", "students", "tests", "submissions", "announcements", "bank"];

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ExportPage() {
  const db = useDatabase();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<EntityKey>>(new Set(ALL));

  function toggle(key: EntityKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function downloadJson() {
    const keys = ALL.filter((k) => selected.has(k));
    if (keys.length === 0) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      organisation: COMPANY_SLUG,
      data: buildExport(db, keys),
    };
    const name = exportFilename(COMPANY_SLUG, new Date().toISOString(), "json");
    download(JSON.stringify(payload, null, 2), name, "application/json");
    toast(`Exported ${keys.length} ${keys.length === 1 ? "entity" : "entities"} as JSON.`, "success");
  }

  function downloadCsv(key: EntityKey) {
    const csv = toCsv(entityRows(db, key));
    if (!csv) return;
    const name = `${COMPANY_SLUG}-${key}-${new Date().toISOString().slice(0, 10)}.csv`;
    download(csv, name, "text/csv");
    toast(`Exported ${ENTITY_LABEL[key]} as CSV.`, "success");
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader title="Data export" subtitle="Download a snapshot of your portal data." />

      <Card className="max-w-2xl p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-2">Choose entities</h2>
        <ul className="mt-3 divide-y divide-border">
          {ALL.map((key) => (
            <li key={key} className="flex items-center justify-between gap-3 py-3">
              <Checkbox checked={selected.has(key)} onChange={() => toggle(key)} label={
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{ENTITY_LABEL[key]}</span>
                  <Badge tone="neutral">{entityCount(db, key)}</Badge>
                </span>
              } />
              {TABULAR.includes(key) && (
                <button onClick={() => downloadCsv(key)} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink">
                  <Icon.Download className="h-3.5 w-3.5" /> CSV
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button onClick={downloadJson} disabled={selected.size === 0}>
            <Icon.Download className="h-4 w-4" /> Download JSON
          </Button>
          <p className="font-mono text-xs text-ink-3">
            {exportFilename(COMPANY_SLUG, new Date().toISOString(), "json")}
          </p>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          JSON includes every selected entity. CSV is available for tabular entities (cohorts, students, submissions).
        </p>
      </Card>
    </div>
  );
}
