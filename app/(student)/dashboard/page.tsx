"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { studentById, testsForStudent, submissionFor } from "@/lib/data/selectors";
import { AnnouncementsPanel } from "@/components/student/AnnouncementsPanel";
import { TestCard } from "@/components/student/TestCard";
import { EmptyState, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { testWindow } from "@/lib/time";

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

export default function DashboardPage() {
  const { session } = useAuth();
  const db = useDatabase();
  const nowMs = Date.now();

  const student = session?.studentId ? studentById(db, session.studentId) : null;

  const groups = useMemo(() => {
    if (!student) return { open: [], upcoming: [], past: [] };
    const tests = testsForStudent(db, student).sort(
      (a, b) => +new Date(a.opensAt) - +new Date(b.opensAt),
    );
    const open = [], upcoming = [], past = [];
    for (const t of tests) {
      const w = testWindow(t.opensAt, t.closesAt, nowMs);
      const sub = submissionFor(db, student.id, t.id);
      if (w === "open" && !sub) open.push(t);
      else if (w === "future") upcoming.push(t);
      else past.push(t);
    }
    return { open, upcoming, past };
  }, [db, student, nowMs]);

  if (!student) return null;

  const hasAny = groups.open.length + groups.upcoming.length + groups.past.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-7 px-4 py-6">
      <header className="animate-fade-up">
        <p className="text-2xl font-extrabold capitalize tracking-tight text-ink">
          {greeting()}, {student.username}.
        </p>
      </header>

      <div className="animate-fade-up" style={{ animationDelay: "60ms" }}>
        <AnnouncementsPanel student={student} />
      </div>

      {!hasAny && (
        <EmptyState
          icon={<Icon.Doc />}
          title="No tests yet"
          message="Nothing to do right now. Your teacher will drop something here soon."
        />
      )}

      {groups.open.length > 0 && (
        <Section title="YOUR MOVE" tone="brand">
          {groups.open.map((t) => (
            <TestCard key={t.id} test={t} submission={submissionFor(db, student.id, t.id)} nowMs={nowMs} />
          ))}
        </Section>
      )}

      {groups.upcoming.length > 0 && (
        <Section title="COMING UP">
          {groups.upcoming.map((t) => (
            <TestCard key={t.id} test={t} submission={submissionFor(db, student.id, t.id)} nowMs={nowMs} />
          ))}
        </Section>
      )}

      {groups.past.length > 0 && (
        <Section title="DONE &amp; DUSTED">
          {groups.past.map((t) => (
            <TestCard key={t.id} test={t} submission={submissionFor(db, student.id, t.id)} nowMs={nowMs} />
          ))}
        </Section>
      )}

      <Link
        href="/progress"
        className={buttonClasses({ variant: "secondary", fullWidth: true, className: "justify-between" })}
      >
        <span className="inline-flex items-center gap-2"><Icon.Chart className="h-[18px] w-[18px]" /> View my progress</span>
        <Icon.ChevronRight className="h-[18px] w-[18px]" />
      </Link>
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "brand";
  children: React.ReactNode;
}) {
  return (
    <section className="animate-fade-up space-y-2.5" style={{ animationDelay: "100ms" }}>
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-2">
        {tone === "brand" && <span className="h-2 w-2 animate-low-pulse rounded-full bg-brand" />}
        {title}
      </h2>
      {children}
    </section>
  );
}
