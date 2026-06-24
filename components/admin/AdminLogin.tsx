"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLockout } from "@/hooks/useLockout";
import { Button, Input } from "@/components/ui";
import { BrandMark } from "@/components/Brand";
import { COMPANY_NAME } from "@/lib/config";
import { formatCountdown } from "@/lib/time";

export function AdminLogin() {
  const router = useRouter();
  const { loginAdmin } = useAuth();
  const lock = useLockout("examia.lock.admin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !lock.isLocked;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const ok = await loginAdmin(email.trim(), password);
    if (ok) {
      lock.reset();
      router.replace("/admin/tests");
    } else {
      lock.registerFailure();
      setError("That email and password don't match an administrator account.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="animate-fade-up text-center" style={{ animationDelay: "40ms" }}>
            <div className="mb-4 inline-flex"><BrandMark size={48} /></div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">{COMPANY_NAME}</h1>
            <p className="mt-1 text-sm text-ink-2">Administrator sign in</p>
          </div>

          <form
            onSubmit={onSubmit}
            className="mt-7 animate-fade-up rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-md)]"
            style={{ animationDelay: "120ms" }}
          >
            <div className="space-y-4">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="admin@example.com"
                autoComplete="email"
                autoCapitalize="none"
                required
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                placeholder="Your password"
                autoComplete="current-password"
                required
              />
            </div>

            {error && !lock.isLocked && (
              <p className="mt-3 rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm font-medium text-error" role="alert">
                {error}
              </p>
            )}
            {lock.isLocked && (
              <p className="mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning" role="alert">
                Too many attempts. Try again in <span className="font-mono">{formatCountdown(lock.remainingSeconds)}</span>.
              </p>
            )}

            <Button type="submit" size="lg" fullWidth loading={busy} disabled={!canSubmit} className="mt-5">
              Sign in
            </Button>
          </form>

          <button
            onClick={() => router.push("/login")}
            className="mx-auto mt-5 block text-center text-xs font-semibold text-ink-3 hover:text-ink-2"
          >
            ← Back to student sign in
          </button>
        </div>
      </div>
    </main>
  );
}
