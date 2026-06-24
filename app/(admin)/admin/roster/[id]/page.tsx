"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useDatabase } from "@/lib/data/store";
import { cohortById, studentById, submissionsForStudent, testById, testsForStudent } from "@/lib/data/selectors";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Badge, CohortDot, EmptyState, Icon, Modal } from "@/components/ui";
import { Button, buttonClasses } from "@/components/ui/Button";
import { LineChart, type LinePoint } from "@/components/charts/LineChart";
import { MasteryBar } from "@/components/charts/MasteryBar";
import { gradeLetter, gradeSubmission } from "@/lib/grading";
import { topicMastery } from "@/lib/scoring";
import { formatTimestamp } from "@/lib/time";
import { ReportDocument } from "@/components/admin/ReportDocument";

function monthOf(iso: string | null | undefined) {
  return iso ? iso.slice(0, 7) : "";
}

function formatMonthLabel(m: string) {
  if (!m) return "All time";
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
}

export default function StudentDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const db = useDatabase();
  const student = studentById(db, id);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState("");
  const [teacherNote, setTeacherNote] = useState("");
  const [downloading, setDownloading] = useState(false);

  const data = useMemo(() => {
    if (!student) return null;
    const subs = submissionsForStudent(db, student.id).sort(
      (a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""),
    );
    const released = subs.filter((s) => s.status === "released");
    const tests = released.flatMap((s) => { const t = testById(db, s.testId); return t ? [t] : []; });
    const points: LinePoint[] = released.flatMap((s) => {
      const t = testById(db, s.testId);
      if (!t) return [];
      return [{ label: (s.submittedAt ?? "").slice(5, 10), value: gradeSubmission(t, s).percent }];
    });
    const avg = points.length ? Math.round((points.reduce((a, p) => a + p.value, 0) / points.length) * 10) / 10 : 0;
    const months = Array.from(new Set(released.map((s) => monthOf(s.submittedAt)).filter(Boolean))).sort();
    return { subs, released, mastery: topicMastery(tests, released), points, avg, months };
  }, [db, student]);

  if (!student || !data) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <PageHeader title="Student not found" back={{ href: "/admin/roster", label: "Roster" }} />
        <EmptyState icon={<Icon.Users />} title="No such student" />
      </div>
    );
  }

  const cohort = cohortById(db, student.cohortId);

  function openReport() {
    setReportMonth(data!.months[data!.months.length - 1] ?? "");
    setTeacherNote("");
    setReportOpen(true);
  }

  async function downloadReport() {
    if (!student) return;
    setDownloading(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");

      const month = reportMonth;
      const allReleased = submissionsForStudent(db, student.id).filter((s) => s.status === "released");

      const prevMonthDate = month
        ? (() => { const [y, mo] = month.split("-").map(Number); return new Date(y, mo - 2, 1); })()
        : null;
      const prevMonth = prevMonthDate
        ? `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`
        : "";

      const monthSubs = month ? allReleased.filter((s) => monthOf(s.submittedAt) === month) : allReleased;
      const prevSubs = prevMonth ? allReleased.filter((s) => monthOf(s.submittedAt) === prevMonth) : [];

      function calcAvg(subs: typeof allReleased) {
        if (!subs.length) return null;
        const sum = subs.reduce((a, s) => {
          const t = testById(db, s.testId);
          return t ? a + gradeSubmission(t, s).percent : a;
        }, 0);
        return Math.round((sum / subs.length) * 10) / 10;
      }

      const monthAvg = calcAvg(monthSubs);
      const prevAvg = calcAvg(prevSubs);
      const delta = monthAvg != null && prevAvg != null ? Math.round((monthAvg - prevAvg) * 10) / 10 : null;
      const grade = monthAvg != null ? gradeLetter(monthAvg) : null;

      // Trend: this month + up to 2 prior months
      const relevantMonths = month
        ? (() => {
            const [y, mo] = month.split("-").map(Number);
            return [-2, -1, 0].map((offset) => {
              const d = new Date(y, mo - 1 + offset, 1);
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            });
          })()
        : Array.from(new Set(allReleased.map((s) => monthOf(s.submittedAt)))).sort().slice(-3);

      const trendMonths = relevantMonths.flatMap((m) => {
        const subs = allReleased.filter((s) => monthOf(s.submittedAt) === m);
        if (!subs.length) return [];
        const a = calcAvg(subs);
        return a != null ? [{ label: m.slice(5), value: a }] : [];
      });

      const perTest = monthSubs.flatMap((s) => {
        const t = testById(db, s.testId);
        if (!t) return [];
        return [{ test: { title: t.title, subject: t.subject }, result: gradeSubmission(t, s) }];
      }).sort((a, b) => b.result.percent - a.result.percent);

      const allTests = allReleased.flatMap((s) => { const t = testById(db, s.testId); return t ? [t] : []; });
      const mastery = topicMastery(allTests, monthSubs);

      const available = testsForStudent(db, student).filter((t) => t.status !== "draft");
      const completionPct = available.length > 0 ? Math.round((allReleased.length / available.length) * 100) : 0;

      const blob = await pdf(
        <ReportDocument
          studentName={student.username}
          cohortName={cohort?.name}
          month={month}
          monthAvg={monthAvg}
          prevAvg={prevAvg}
          delta={delta}
          grade={grade}
          trendMonths={trendMonths}
          perTest={perTest}
          mastery={mastery}
          completionPct={completionPct}
          completed={allReleased.length}
          available={available.length}
          teacherNote={teacherNote}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = student.username.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      const monthSlug = month || "all";
      link.href = url;
      link.download = `report-${safeName}-${monthSlug}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setReportOpen(false);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title={student.username}
        subtitle={student.email}
        back={{ href: "/admin/roster", label: "Roster" }}
        actions={
          <div className="flex items-center gap-2">
            {cohort && (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2">
                <CohortDot color={cohort.color} />{cohort.name}
              </span>
            )}
            <Button variant="secondary" size="sm" onClick={openReport}>
              <Icon.Download className="h-4 w-4" /> Monthly Report
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Submissions" value={String(data.subs.length)} />
        <Stat label="Released" value={String(data.released.length)} />
        <Stat label="Average" value={`${data.avg}%`} />
      </div>

      {data.released.length > 0 ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-2">Score trend</h2>
            <LineChart points={data.points} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-2">Topic mastery</h2>
            <div className="space-y-3.5">
              {data.mastery.map((m) => <MasteryBar key={m.topic} topic={m.topic} percent={m.percent} band={m.band} />)}
            </div>
          </Card>
        </div>
      ) : (
        <EmptyState className="mt-5" icon={<Icon.Chart />} title="No released results yet" message="Release a result to build this student's analytics." />
      )}

      <h2 className="mb-2.5 mt-7 text-sm font-bold uppercase tracking-wide text-ink-2">Submissions</h2>
      {data.subs.length === 0 ? (
        <EmptyState icon={<Icon.Inbox />} title="No submissions" />
      ) : (
        <div className="space-y-2">
          {data.subs.map((s) => {
            const test = testById(db, s.testId);
            const grade = test ? gradeSubmission(test, s) : null;
            return (
              <Card key={s.id} className="flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{test?.title ?? "—"}</p>
                  <p className="text-sm text-ink-2">{s.submittedAt ? formatTimestamp(s.submittedAt) : "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.status === "released" && grade ? (
                    <Badge tone="success">{grade.percent}% · {grade.letter}</Badge>
                  ) : (
                    <Badge tone="warning">Awaiting</Badge>
                  )}
                  <Link href={`/admin/grading/${s.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    {s.status === "released" ? "Review" : "Grade"}
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Monthly Report Modal */}
      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Monthly report"
        description="Pick the month and add an optional teacher note. The PDF downloads automatically."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReportOpen(false)} disabled={downloading}>Cancel</Button>
            <Button onClick={downloadReport} loading={downloading} disabled={data.months.length === 0}>
              {downloading ? "Generating..." : "Download PDF"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-2">Month</label>
            {data.months.length === 0 ? (
              <p className="text-sm text-ink-3">No released results yet.</p>
            ) : (
              <select
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {data.months.map((m) => (
                  <option key={m} value={m}>{formatMonthLabel(m)}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-2">
              Teacher note <span className="font-normal normal-case text-ink-3">(optional)</span>
            </label>
            <textarea
              value={teacherNote}
              onChange={(e) => setTeacherNote(e.target.value)}
              placeholder="Add a personal note for the parent..."
              rows={4}
              maxLength={600}
              className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <p className="mt-1 text-right text-xs text-ink-3">{teacherNote.length}/600</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4 text-center">
      <p className="font-display text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-xs text-ink-3">{label}</p>
    </Card>
  );
}
