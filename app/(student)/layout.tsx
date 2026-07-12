"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useDatabase, useDataReady } from "@/lib/data/store";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { studentById } from "@/lib/data/selectors";
import { BrandMark } from "@/components/Brand";
import { CohortTag } from "@/components/ui";
import { Icon } from "@/components/ui";
import { cohortById } from "@/lib/data/selectors";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ForceChangePasswordDialog } from "@/components/student/ForceChangePasswordDialog";
import { cn } from "@/lib/cn";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { session, logout, initializing, mustChangePassword } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const db = useDatabase();
  const ready = useDataReady();

  useRealtimeSync();

  useEffect(() => {
    if (!initializing && (!session || session.role !== "student")) router.replace("/login");
  }, [session, initializing, router]);

  if (initializing || !ready || !session || session.role !== "student" || !session.studentId) {
    return <div className="flex min-h-dvh items-center justify-center text-ink-3">Loading…</div>;
  }

  const student = studentById(db, session.studentId);
  if (!student) {
    return <div className="flex min-h-dvh items-center justify-center text-ink-3">Session expired…</div>;
  }
  const cohort = cohortById(db, student.cohortId);

  // The test runner is distraction-free — it hides the global nav itself.
  const inRunner = /^\/test\/[^/]+$/.test(pathname);

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: <Icon.Dashboard className="h-[18px] w-[18px]" /> },
    { href: "/progress", label: "Progress", icon: <Icon.Chart className="h-[18px] w-[18px]" /> },
    { href: "/notes", label: "Notes", icon: <Icon.Doc className="h-[18px] w-[18px]" /> },
    { href: "/settings", label: "Settings", icon: <Icon.Palette className="h-[18px] w-[18px]" /> },
  ];

  return (
    <div className="min-h-dvh">
      {!inRunner && (
        <header className="sticky top-0 z-30 border-b border-border bg-paper/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4">
            <Link href="/dashboard" className="flex items-center gap-2" aria-label="Home">
              <BrandMark size={26} />
              <span className="hidden font-display text-base font-extrabold tracking-tight text-ink sm:inline">
                {student.username}
              </span>
            </Link>

            <nav className="flex items-center gap-1" aria-label="Primary">
              {links.map((l) => {
                const active = pathname === l.href;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={cn(
                      "flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors",
                      active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {l.icon}
                    <span className="hidden sm:inline">{l.label}</span>
                  </Link>
                );
              })}
              <NotificationBell />
              <button
                onClick={() => { logout(); router.replace("/login"); }}
                className="flex h-11 w-11 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
                aria-label="Sign out"
                title="Sign out"
              >
                <Icon.Logout className="h-[18px] w-[18px]" />
              </button>
            </nav>
          </div>
          {cohort && (
            <div className="mx-auto max-w-3xl px-4 pb-2">
              <CohortTag color={cohort.color} name={cohort.name} className="text-xs" />
            </div>
          )}
        </header>
      )}
      {children}
      {mustChangePassword && <ForceChangePasswordDialog />}
    </div>
  );
}
