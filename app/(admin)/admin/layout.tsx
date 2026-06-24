"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useDataReady } from "@/lib/data/store";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { useToast } from "@/components/toast";
import { AdminFilterProvider } from "@/lib/admin-filter";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { Sidebar } from "@/components/admin/Sidebar";
import { Icon } from "@/components/ui";
import { Wordmark } from "@/components/Brand";

const IDLE_MS = 30 * 60 * 1000; // 30-minute idle session timeout

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, logout, initializing } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const ready = useDataReady();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = session?.role === "admin";

  useSessionTimeout(
    () => {
      logout();
      toast("Signed out after 30 minutes of inactivity.", "info");
      router.replace("/login");
    },
    IDLE_MS,
    isAdmin,
  );

  if (initializing) {
    return <div className="flex min-h-dvh items-center justify-center text-ink-3">Loading…</div>;
  }
  if (!isAdmin) return <AdminLogin />;
  if (!ready) {
    return <div className="flex min-h-dvh items-center justify-center text-ink-3">Loading…</div>;
  }

  return (
    <AdminFilterProvider>
      <div className="flex min-h-dvh">
        {/* Persistent sidebar — tablet narrower, desktop full */}
        <aside className="hidden w-56 shrink-0 border-r border-border md:block lg:w-64">
          <div className="sticky top-0 h-dvh">
            <Sidebar />
          </div>
        </aside>

        {/* Mobile overlay sidebar */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} aria-hidden />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[82%] animate-slide-in border-r border-border shadow-[var(--shadow-lg)]">
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-paper/85 px-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 md:hidden"
                aria-label="Open navigation"
              >
                <Icon.Menu />
              </button>
              <div className="md:hidden"><Wordmark markSize={22} /></div>
            </div>
            <button
              onClick={() => { logout(); router.replace("/login"); }}
              className="flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <Icon.Logout className="h-[18px] w-[18px]" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </header>

          <main className="flex-1">{children}</main>
        </div>
      </div>
    </AdminFilterProvider>
  );
}
