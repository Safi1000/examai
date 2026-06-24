"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDatabase } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { cohortById } from "@/lib/data/selectors";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Badge, CohortDot, EmptyState, Icon, TableScroll, Table, Th, Td } from "@/components/ui";
import { BarChart, type Bar } from "@/components/charts/BarChart";
import { LineChart, type LinePoint } from "@/components/charts/LineChart";
import { MasteryBar } from "@/components/charts/MasteryBar";
import { gradeLetter, gradeRole, gradeSubmission, GRADE_ORDER, type GradeLetter } from "@/lib/grading";
import { awardedMarks, percent, topicMastery, totalMarks, type TopicMastery } from "@/lib/scoring";
import type { Cohort, Student, Submission, Test } from "@/types";
import { cn } from "@/lib/cn";

type View = "class" | "student";

function monthOf(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 7) : "";
}

function formatMonth(m: string): string {
  if (!m) return "All time";
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
}

function calcAvg(subs: Submission[], testById: Map<string, Test>): number {
  if (!subs.length) return 0;
  const sum = subs.reduce((s, sub) => {
    const t = testById.get(sub.testId);
    return t ? s + percent(awardedMarks(sub), totalMarks(t)) : s;
  }, 0);
  return Math.round((sum / subs.length) * 10) / 10;
}

// ---- Typed data shapes -----

interface PerTestRow { test: Test; count: number; avg: number | null; top: GradeLetter | null }
interface StudentMovement { student: Student; curAvg: number | null; delta: number | null }
interface CohortCompletion { cohort: Cohort; pct: number; submitted: number; expected: number }

interface ClassViewData {
  overall: number;
  monthly: number;
  delta: number | null;
  trendPoints: LinePoint[];
  bars: Bar[];
  perTest: PerTestRow[];
  improved: StudentMovement[];
  slipping: StudentMovement[];
  mastery: TopicMastery[];
  cohortCompletion: CohortCompletion[];
}

interface StudentPerTest { test: Test; result: ReturnType<typeof gradeSubmission> }

interface StudentViewData {
  student: Student;
  avg: number | null;
  delta: number | null;
  grade: GradeLetter | null;
  trendPoints: LinePoint[];
  perTest: StudentPerTest[];
  mastery: TopicMastery[];
  completionPct: number;
  completed: number;
  total: number;
}

// ---- Page ------------------------------------------------------------------

export default function AnalyticsPage() {
  const db = useDatabase();
  const { cohortId } = useAdminFilter();
  const [view, setView] = useState<View>("class");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  const testById = useMemo(() => new Map(db.tests.map((t) => [t.id, t])), [db.tests]);

  const base = useMemo(() => {
    const students = db.students.filter((s) => (cohortId ? s.cohortId === cohortId : true));
    const studentIds = new Set(students.map((s) => s.id));
    const relevantTests = db.tests.filter(
      (t) => (cohortId ? t.cohortId === cohortId || t.cohortId === null : true) && t.status !== "draft",
    );
    const relevantTestIds = new Set(relevantTests.map((t) => t.id));
    const released = db.submissions.filter(
      (s) => s.status === "released" && studentIds.has(s.studentId) && relevantTestIds.has(s.testId),
    );
    const allMonths = Array.from(new Set(released.map((s) => monthOf(s.submittedAt)).filter(Boolean))).sort();
    return { students, studentIds, relevantTests, relevantTestIds, released, allMonths };
  }, [db, cohortId]);

  const activeMonth = selectedMonth || base.allMonths[base.allMonths.length - 1] || "";
  const prevMonth = activeMonth ? (base.allMonths[base.allMonths.indexOf(activeMonth) - 1] ?? "") : "";

  const monthSubs = useMemo(
    () => (activeMonth ? base.released.filter((s) => monthOf(s.submittedAt) === activeMonth) : base.released),
    [base.released, activeMonth],
  );
  const prevMonthSubs = useMemo(
    () => (prevMonth ? base.released.filter((s) => monthOf(s.submittedAt) === prevMonth) : []),
    [base.released, prevMonth],
  );

  const classData = useMemo((): ClassViewData => {
    const overall = calcAvg(base.released, testById);
    const monthly = calcAvg(monthSubs, testById);
    const prevMonthAvg = calcAvg(prevMonthSubs, testById);
    const delta = prevMonthSubs.length ? Math.round((monthly - prevMonthAvg) * 10) / 10 : null;

    const trendPoints: LinePoint[] = base.allMonths.map((m) => ({
      label: m.slice(5),
      value: calcAvg(base.released.filter((s) => monthOf(s.submittedAt) === m), testById),
    }));

    const dist: Record<string, number> = Object.fromEntries(GRADE_ORDER.map((g) => [g, 0]));
    monthSubs.forEach((s) => {
      const t = testById.get(s.testId);
      if (t) dist[gradeLetter(gradeSubmission(t, s).percent)]++;
    });
    const bars: Bar[] = GRADE_ORDER.map((g) => ({ label: g, value: dist[g] ?? 0, role: gradeRole(g) }));

    const perTest: PerTestRow[] = base.relevantTests.map((t) => {
      const ts = monthSubs.filter((s) => s.testId === t.id);
      const avg = ts.length ? calcAvg(ts, testById) : null;
      const top = ts.length
        ? (gradeLetter(Math.max(...ts.map((s) => gradeSubmission(t, s).percent))) as GradeLetter)
        : null;
      return { test: t, count: ts.length, avg, top };
    }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));

    const movement = base.students.map((st) => {
      const cur = monthSubs.filter((s) => s.studentId === st.id);
      const prev = prevMonthSubs.filter((s) => s.studentId === st.id);
      const curAvg = cur.length ? calcAvg(cur, testById) : null;
      const prevAvg = prev.length ? calcAvg(prev, testById) : null;
      const d = curAvg != null && prevAvg != null ? Math.round((curAvg - prevAvg) * 10) / 10 : null;
      return { student: st, curAvg, delta: d };
    }).filter((x) => x.delta != null);

    const improved = [...movement].filter((x) => (x.delta ?? 0) > 0).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).slice(0, 5);
    const slipping = [...movement].filter((x) => (x.delta ?? 0) < 0).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)).slice(0, 5);

    const mastery = topicMastery(base.relevantTests, monthSubs);

    const cohortCompletion: CohortCompletion[] = db.cohorts.map((c) => {
      const cs = base.students.filter((s) => s.cohortId === c.id);
      const ct = base.relevantTests.filter((t) => t.cohortId === c.id || t.cohortId === null);
      const expected = cs.length * ct.length;
      const submitted = monthSubs.filter(
        (s) => cs.some((st) => st.id === s.studentId) && ct.some((t) => t.id === s.testId),
      ).length;
      const pct = expected > 0 ? Math.round((submitted / expected) * 100) : 0;
      return { cohort: c, pct, submitted, expected };
    }).filter((x) => x.expected > 0);

    return { overall, monthly, delta, trendPoints, bars, perTest, improved, slipping, mastery, cohortCompletion };
  }, [base, monthSubs, prevMonthSubs, testById, db.cohorts]);

  const studentData = useMemo((): StudentViewData | null => {
    const student = db.students.find((s) => s.id === selectedStudentId);
    if (!student) return null;

    const allSubs = base.released.filter((s) => s.studentId === student.id);
    const curSubs = monthSubs.filter((s) => s.studentId === student.id);
    const prevSubs = prevMonthSubs.filter((s) => s.studentId === student.id);

    const avg = curSubs.length ? calcAvg(curSubs, testById) : null;
    const prevAvg = prevSubs.length ? calcAvg(prevSubs, testById) : null;
    const delta = avg != null && prevAvg != null ? Math.round((avg - prevAvg) * 10) / 10 : null;
    const grade = avg != null ? gradeLetter(avg) : null;

    const trendPoints: LinePoint[] = allSubs
      .slice()
      .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""))
      .flatMap((s) => {
        const t = testById.get(s.testId);
        if (!t) return [];
        return [{ label: (s.submittedAt ?? "").slice(5, 10), value: gradeSubmission(t, s).percent }];
      });

    const perTest: StudentPerTest[] = curSubs
      .flatMap((s) => {
        const t = testById.get(s.testId);
        if (!t) return [];
        return [{ test: t, result: gradeSubmission(t, s) }];
      })
      .sort((a, b) => b.result.percent - a.result.percent);

    const mastery = topicMastery(base.relevantTests, curSubs);
    const total = base.relevantTests.length;
    const completed = allSubs.length;
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { student, avg, delta, grade, trendPoints, perTest, mastery, completionPct, completed, total };
  }, [base, monthSubs, prevMonthSubs, testById, selectedStudentId, db.students]);

  const scopeCohort = cohortId ? cohortById(db, cohortId) : null;
  const hasData = base.released.length > 0;

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader title="Analytics" subtitle={scopeCohort ? `Filtered to ${scopeCohort.name}` : "All cohorts"} />

      {/* Controls row */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border bg-surface p-0.5">
          {(["class", "student"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                view === v ? "bg-brand text-on-brand" : "text-ink-2 hover:text-ink",
              )}
            >
              {v === "class" ? "Class view" : "Student view"}
            </button>
          ))}
        </div>

        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
        >
          {base.allMonths.length > 1 && <option value="">All time</option>}
          {base.allMonths.map((m) => (
            <option key={m} value={m}>{formatMonth(m)}</option>
          ))}
        </select>

        {view === "student" && (
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="h-9 flex-1 min-w-[180px] rounded-lg border border-border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">Select a student...</option>
            {base.students.map((s) => (
              <option key={s.id} value={s.id}>{s.username}</option>
            ))}
          </select>
        )}
      </div>

      {!hasData ? (
        <EmptyState icon={<Icon.Chart />} title="No released results yet" message="Release some results to see analytics." />
      ) : view === "class" ? (
        <ClassView data={classData} db={db} prevMonth={prevMonth} activeMonth={activeMonth} />
      ) : !studentData ? (
        <EmptyState icon={<Icon.Chart />} title="Pick a student" message="Choose a student from the dropdown above." />
      ) : (
        <StudentView data={studentData} />
      )}
    </div>
  );
}

// ---- Class View -----------------------------------------------------------

function ClassView({
  data,
  db,
  prevMonth,
  activeMonth,
}: {
  data: ClassViewData;
  db: ReturnType<typeof useDatabase>;
  prevMonth: string;
  activeMonth: string;
}) {
  const monthLabel = activeMonth ? formatMonth(activeMonth).split(" ")[0] : "This month";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="All-time average" value={`${data.overall}%`} />
        <MetricCard label={`Average (${monthLabel})`} value={`${data.monthly}%`} delta={data.delta} />
        <MetricCard label="A/A* this month" value={String(data.bars.filter((b) => b.label === "A*" || b.label === "A").reduce((s, b) => s + b.value, 0))} note="students" />
        <MetricCard label="Needs support" value={String(data.bars.filter((b) => b.label === "E" || b.label === "U").reduce((s, b) => s + b.value, 0))} note="E or U" />
      </div>

      {data.trendPoints.length >= 2 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-2">Class average trend</h2>
          <LineChart points={data.trendPoints} height={160} />
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-2">Grade distribution</h2>
          <BarChart bars={data.bars} />
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-2">Weak topics</h2>
          <div className="space-y-3.5">
            {data.mastery.length === 0 ? (
              <p className="text-sm text-ink-3">No graded topics yet.</p>
            ) : (
              data.mastery.slice(0, 6).map((m) => <MasteryBar key={m.topic} topic={m.topic} percent={m.percent} band={m.band} />)
            )}
          </div>
        </Card>

        {prevMonth && (
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-2">Most improved</h2>
            {data.improved.length === 0 ? (
              <p className="text-sm text-ink-3">No comparable data yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.improved.map(({ student, curAvg, delta }) => {
                  const cohort = cohortById(db, student.cohortId);
                  return (
                    <li key={student.id}>
                      <Link href={`/admin/roster/${student.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold capitalize text-ink">{student.username}</p>
                          {cohort && <p className="flex items-center gap-1 text-xs text-ink-3"><CohortDot color={cohort.color} />{cohort.name}</p>}
                        </div>
                        <span className="font-mono text-sm text-ink">{curAvg}%</span>
                        <Badge tone="success">+{delta}%</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {prevMonth && (
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-2">Needs attention</h2>
            {data.slipping.length === 0 ? (
              <p className="text-sm text-ink-3">No notable drops this month.</p>
            ) : (
              <ul className="space-y-2">
                {data.slipping.map(({ student, curAvg, delta }) => {
                  const cohort = cohortById(db, student.cohortId);
                  return (
                    <li key={student.id}>
                      <Link href={`/admin/roster/${student.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold capitalize text-ink">{student.username}</p>
                          {cohort && <p className="flex items-center gap-1 text-xs text-ink-3"><CohortDot color={cohort.color} />{cohort.name}</p>}
                        </div>
                        <span className="font-mono text-sm text-ink">{curAvg}%</span>
                        <Badge tone="error">{delta}%</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-2">Per-test stats</h2>
        </div>
        <TableScroll>
          <Table stickyFirst>
            <thead>
              <tr><Th>Test</Th><Th>Subject</Th><Th>Results</Th><Th>Average</Th><Th>Top grade</Th></tr>
            </thead>
            <tbody>
              {data.perTest.map(({ test, count, avg, top }) => (
                <tr key={test.id}>
                  <Td className="font-semibold">{test.title}</Td>
                  <Td className="text-ink-2">{test.subject}</Td>
                  <Td className="font-mono">{count}</Td>
                  <Td className="font-mono">{avg != null ? `${avg}%` : <span className="text-ink-3">—</span>}</Td>
                  <Td>{top ? <Badge tone={gradeRole(top)}>{top}</Badge> : <span className="text-ink-3">—</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
      </Card>

      {data.cohortCompletion.length > 0 && (
        <Card className="p-0">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-2">Completion by cohort</h2>
          </div>
          <ul className="divide-y divide-border">
            {data.cohortCompletion.map(({ cohort, pct, submitted, expected }) => (
              <li key={cohort.id} className="flex items-center gap-3 px-5 py-3">
                <CohortDot color={cohort.color} />
                <span className="flex-1 text-sm font-semibold text-ink">{cohort.name}</span>
                <span className="font-mono text-sm text-ink-2">{submitted}/{expected}</span>
                <Badge tone={pct >= 75 ? "success" : pct >= 50 ? "warning" : "error"}>{pct}%</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ---- Student View ---------------------------------------------------------

function StudentView({ data }: { data: StudentViewData }) {
  const deltaSign = (data.delta ?? 0) > 0 ? "+" : "";
  const deltaTone: "success" | "error" | undefined =
    (data.delta ?? 0) > 0 ? "success" : (data.delta ?? 0) < 0 ? "error" : undefined;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Average this month" value={data.avg != null ? `${data.avg}%` : "—"} />
        <MetricCard label="Grade" value={data.grade ?? "—"} tone={data.grade ? gradeRole(data.grade) : undefined} />
        {data.delta != null && (
          <MetricCard label="vs last month" value={`${deltaSign}${data.delta}%`} tone={deltaTone} />
        )}
        <MetricCard label="Completion" value={`${data.completionPct}%`} note={`${data.completed}/${data.total} tests`} />
      </div>

      {data.trendPoints.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-2">Score trend</h2>
          <LineChart points={data.trendPoints} height={160} />
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-2">Tests this month</h2>
          {data.perTest.length === 0 ? (
            <p className="text-sm text-ink-3">No results this month.</p>
          ) : (
            <ul className="space-y-2">
              {data.perTest.map(({ test, result }) => (
                <li key={test.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2/60 px-3 py-2.5">
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
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-2">Topic mastery</h2>
          {data.mastery.length === 0 ? (
            <p className="text-sm text-ink-3">No graded topics yet.</p>
          ) : (
            <div className="space-y-3.5">
              {data.mastery.map((m) => <MasteryBar key={m.topic} topic={m.topic} percent={m.percent} band={m.band} />)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---- Shared UI ------------------------------------------------------------

function MetricCard({
  label, value, delta, note, tone,
}: {
  label: string;
  value: string;
  delta?: number | null;
  note?: string;
  tone?: "success" | "warning" | "error";
}) {
  const toneClass = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "error" ? "text-error" : "text-ink";
  return (
    <Card ruled className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className={cn("mt-1 font-display text-3xl font-extrabold", toneClass)}>{value}</p>
      {delta != null && (
        <p className={cn("mt-0.5 text-xs font-semibold", delta > 0 ? "text-success" : delta < 0 ? "text-error" : "text-ink-3")}>
          {delta > 0 ? "+" : ""}{delta}% vs last month
        </p>
      )}
      {note && <p className="mt-0.5 text-xs text-ink-3">{note}</p>}
    </Card>
  );
}
