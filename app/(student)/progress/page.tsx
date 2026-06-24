"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { studentById, submissionsForStudent, testById, testsForStudent } from "@/lib/data/selectors";
import { LineChart, type LinePoint } from "@/components/charts/LineChart";
import { MasteryBar } from "@/components/charts/MasteryBar";
import { Card, EmptyState, Icon, Badge } from "@/components/ui";
import { gradeLetter, gradeRole, gradeSubmission } from "@/lib/grading";
import { topicMastery } from "@/lib/scoring";
import { cn } from "@/lib/cn";

function monthOf(iso: string | null | undefined) {
  return iso ? iso.slice(0, 7) : "";
}

export default function ProgressPage() {
  const { session } = useAuth();
  const db = useDatabase();
  const student = session?.studentId ? studentById(db, session.studentId) : null;

  const data = useMemo(() => {
    if (!student) return null;

    const allReleased = submissionsForStudent(db, student.id)
      .filter((s) => s.status === "released")
      .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));

    const tests = allReleased.flatMap((s) => {
      const t = testById(db, s.testId);
      return t ? [t] : [];
    });

    // Monthly grouping
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;

    const curSubs = allReleased.filter((s) => monthOf(s.submittedAt) === curMonth);
    const prevSubs = allReleased.filter((s) => monthOf(s.submittedAt) === prevMonth);

    function avg(subs: typeof allReleased) {
      if (!subs.length) return null;
      const sum = subs.reduce((a, s) => {
        const t = testById(db, s.testId);
        return t ? a + gradeSubmission(t, s).percent : a;
      }, 0);
      return Math.round((sum / subs.length) * 10) / 10;
    }

    const monthAvg = avg(curSubs);
    const prevMonthAvg = avg(prevSubs);
    const delta = monthAvg != null && prevMonthAvg != null
      ? Math.round((monthAvg - prevMonthAvg) * 10) / 10
      : null;
    const overallAvg = avg(allReleased);
    const grade = monthAvg != null ? gradeLetter(monthAvg) : overallAvg != null ? gradeLetter(overallAvg) : null;

    // Trend: all released, chronological
    const trendPoints: LinePoint[] = allReleased.flatMap((s) => {
      const t = testById(db, s.testId);
      if (!t) return [];
      return [{ label: (s.submittedAt ?? "").slice(5, 10), value: gradeSubmission(t, s).percent }];
    });

    // Per-test list (most recent first)
    const perTest = [...allReleased].reverse().flatMap((s) => {
      const t = testById(db, s.testId);
      if (!t) return [];
      return [{ test: t, sub: s, result: gradeSubmission(t, s) }];
    });

    // Topic mastery (ranked worst to best)
    const mastery = topicMastery(tests, allReleased);

    // Completion
    const available = testsForStudent(db, student).filter((t) => t.status !== "draft");
    const completionPct = available.length > 0
      ? Math.round((allReleased.length / available.length) * 100)
      : 0;

    return { allReleased, trendPoints, perTest, mastery, monthAvg, prevMonthAvg, delta, overallAvg, grade, completionPct, available: available.length };
  }, [db, student]);

  if (!student || !data) return null;

  if (data.allReleased.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">My progress</h1>
        <EmptyState
          className="mt-5"
          icon={<Icon.Chart />}
          title="Nothing yet"
          message="Once your teacher releases results, your scores and topic mastery show up here."
        />
      </div>
    );
  }

  const weak = data.mastery.filter((m) => m.band !== "mastery");
  const displayAvg = data.monthAvg ?? data.overallAvg ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <header className="animate-fade-up">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">My progress</h1>
      </header>

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Average" value={`${displayAvg}%`} />
        {data.grade && (
          <StatCard
            label="Grade"
            value={data.grade}
            tone={gradeRole(data.grade)}
          />
        )}
        {data.delta != null && (
          <StatCard
            label="vs last month"
            value={`${data.delta > 0 ? "+" : ""}${data.delta}%`}
            tone={data.delta > 0 ? "success" : data.delta < 0 ? "error" : undefined}
            icon={data.delta > 0 ? "up" : data.delta < 0 ? "down" : undefined}
          />
        )}
        <StatCard label="Completion" value={`${data.completionPct}%`} note={`${data.allReleased.length}/${data.available}`} />
      </div>

      {/* Score trend */}
      <Card className="animate-fade-up p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-2">Score trend</h2>
        <p className="mb-3 text-xs text-ink-3">Each dot is one released test, chronological.</p>
        <LineChart points={data.trendPoints} />
      </Card>

      {/* Per-test list */}
      <Card className="animate-fade-up p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-2">All results</h2>
        <ul className="space-y-2">
          {data.perTest.map(({ test, result }) => (
            <li key={test.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2/50 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{test.title}</p>
                <p className="text-xs text-ink-3">{test.subject}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-ink">{result.percent}%</span>
                <Badge tone={gradeRole(result.letter)}>{result.letter}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Topic mastery */}
      <Card className="animate-fade-up p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-2">Topic mastery</h2>
          {weak.length > 0 && <Badge tone="warning">{weak.length} to review</Badge>}
        </div>
        <div className="mt-4 space-y-4">
          {data.mastery.map((m) => (
            <MasteryBar key={m.topic} topic={m.topic} percent={m.percent} band={m.band} />
          ))}
        </div>
      </Card>

      {/* Focus areas */}
      {weak.length > 0 && (
        <Card className="animate-fade-up border-warning/30 bg-warning-soft/40 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-warning">
            <Icon.Flag className="h-4 w-4" /> Where to focus
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm text-ink">
            {weak.map((m) => (
              <li key={m.topic} className="flex items-center justify-between gap-2">
                <span>{m.topic}</span>
                <span className={m.band === "critical" ? "font-semibold text-error" : "font-semibold text-warning"}>
                  {m.band === "critical" ? "Critical" : "Weak"} {Math.round(m.percent)}%
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Link href="/dashboard" className="block text-center text-sm font-semibold text-brand hover:underline">
        Back to home
      </Link>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  note,
  icon,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "error";
  note?: string;
  icon?: "up" | "down";
}) {
  const toneClass = tone === "success" ? "text-success" : tone === "error" ? "text-error" : tone === "warning" ? "text-warning" : "text-ink";
  return (
    <Card className="animate-fade-up p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className={cn("mt-1 flex items-center gap-1 font-display text-3xl font-extrabold", toneClass)}>
        {icon === "up" && <span className="text-2xl">↑</span>}
        {icon === "down" && <span className="text-2xl">↓</span>}
        {value}
      </p>
      {note && <p className="mt-0.5 text-xs text-ink-3">{note}</p>}
    </Card>
  );
}
