"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLockout } from "@/hooks/useLockout";
import { COMPANY_NAME } from "@/lib/config";
import { formatCountdown } from "@/lib/time";
import { cn } from "@/lib/cn";

const fieldClass =
  "w-full h-12 rounded-md border border-border-strong bg-surface-2 px-3.5 text-ink " +
  "placeholder:text-ink-3 transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export default function StudentLoginPage() {
  const router = useRouter();
  const { loginStudent } = useAuth();
  const lock = useLockout("examia.lock.student");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !lock.isLocked;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const ok = await loginStudent(username, password);
    if (ok) {
      lock.reset();
      router.push("/dashboard");
    } else {
      lock.registerFailure();
      setError("Wrong username or password.");
      setBusy(false);
    }
  }

  return (
    <main
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10"
      style={{ background: "var(--color-paper)" }}
    >
      {/* Decorative ambient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-24 -top-24 h-80 w-80 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(14,110,104,0.18), transparent 70%)" }}
        />
        <div
          className="absolute -bottom-20 -right-16 h-72 w-72 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(14,110,104,0.12), transparent 70%)" }}
        />
        {/* Dot grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(rgba(35,33,28,0.06) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <form
          onSubmit={onSubmit}
          className="animate-fade-up overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lg)]"
          style={{ animationDelay: "80ms" }}
        >
          {/* Brand accent bar */}
          <div className="h-1 w-full" style={{ background: "var(--color-brand)" }} />

          <div className="p-8">
            {/* Brand + tagline */}
            <div className="mb-8 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-2">
                {COMPANY_NAME}
              </p>
              <h1
                className="mt-4 text-4xl font-bold leading-tight"
                style={{ fontFamily: "var(--font-caveat)", color: "var(--color-brand)" }}
              >
                Start from scratch.<br />Finish exam ready.
              </h1>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-2">
                  Username
                </label>
                <input
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(null); }}
                  placeholder="Your username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  disabled={busy || lock.isLocked}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder="Your password"
                  autoComplete="current-password"
                  required
                  disabled={busy || lock.isLocked}
                  className={fieldClass}
                />
              </div>
            </div>

            {error && !lock.isLocked && (
              <p className="mt-3 rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm font-medium text-error" role="alert">
                {error}
              </p>
            )}
            {lock.isLocked && (
              <p className="mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning" role="alert">
                Too many wrong guesses. Try again in{" "}
                <span className="font-mono">{formatCountdown(lock.remainingSeconds)}</span>.
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit || busy}
              className={cn(
                "mt-5 w-full rounded-lg px-4 py-3 text-sm font-bold",
                "transition-opacity hover:opacity-90 active:opacity-80",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "flex items-center justify-center gap-2",
              )}
              style={{ background: "var(--color-brand)", color: "var(--color-on-brand)" }}
            >
              {busy ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-on-brand/30 border-t-on-brand" />
              ) : (
                "Let me in"
              )}
            </button>

            <p className="mt-4 text-center text-xs text-ink-3">
              Locked out? Your teacher has the key.
            </p>
          </div>
        </form>
      </div>

      {/* Hidden admin hotspot */}
      <button
        onClick={() => router.push("/admin")}
        aria-label="Administrator access"
        title=""
        className="mt-4 h-8 w-24 rounded opacity-0"
        tabIndex={-1}
      />

      {/* TechxServe attribution */}
      <div className="relative mt-8 flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="h-px w-14" style={{ background: "var(--color-border-strong)" }} />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-3">Powered by</span>
          <div className="h-px w-14" style={{ background: "var(--color-border-strong)" }} />
        </div>
        <a
          href="https://techxserve.com"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-opacity hover:opacity-80"
        >
          <img src="/logo.png" alt="TechxServe" className="h-[72px] w-auto" />
        </a>
        <div className="flex items-center gap-3 text-sm font-semibold">
          <a
            href="https://techxserve.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--color-brand)" }}
            className="hover:underline"
          >
            techxserve.com
          </a>
          <span className="text-ink-3">·</span>
          <a
            href="mailto:info@techxserve.com"
            style={{ color: "var(--color-brand)" }}
            className="hover:underline"
          >
            info@techxserve.com
          </a>
        </div>
      </div>
    </main>
  );
}
