"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDatabase } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { Wordmark } from "@/components/Brand";
import { CohortDot, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/admin/tests", label: "Tests", icon: Icon.Doc },
  { href: "/admin/bank", label: "Question bank", icon: Icon.Bank },
  { href: "/admin/submissions", label: "Submissions", icon: Icon.Inbox },
  { href: "/admin/cohorts", label: "Cohorts", icon: Icon.Layers },
  { href: "/admin/roster", label: "Roster", icon: Icon.Users },
  { href: "/admin/notes", label: "Notes", icon: Icon.Download },
  { href: "/admin/announcements", label: "Announcements", icon: Icon.Megaphone },
  { href: "/admin/flags", label: "Question flags", icon: Icon.Flag },
  { href: "/admin/security", label: "Exam security", icon: Icon.Lock },
  { href: "/admin/analytics", label: "Analytics", icon: Icon.Chart },
  { href: "/admin/export", label: "Export", icon: Icon.Download },
  { href: "/admin/settings", label: "Settings", icon: Icon.Palette },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const db = useDatabase();
  const { cohortId, setCohortId } = useAdminFilter();

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="border-b border-border px-5 py-4">
        <Link href="/admin/tests" onClick={onNavigate}>
          <Wordmark markSize={24} />
        </Link>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Admin console</p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3" aria-label="Admin">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const I = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors",
                active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <I className="h-[18px] w-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <p className="px-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Filter by cohort</p>
        <button
          onClick={() => setCohortId(null)}
          className={cn(
            "flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-sm transition-colors",
            cohortId === null ? "bg-surface-2 font-semibold text-ink" : "text-ink-2 hover:bg-surface-2",
          )}
        >
          <span className="h-2.5 w-2.5 rounded-full border border-border-strong" />
          All cohorts
        </button>
        {db.cohorts.map((c) => (
          <button
            key={c.id}
            onClick={() => setCohortId(cohortId === c.id ? null : c.id)}
            className={cn(
              "flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-sm transition-colors",
              cohortId === c.id ? "bg-surface-2 font-semibold text-ink" : "text-ink-2 hover:bg-surface-2",
            )}
          >
            <CohortDot color={c.color} />
            <span className="truncate">{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
