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

const FEATURES = [
  "Timed exams with live countdown",
  "Instant score & topic analysis",
  "Practice at your own pace",
  "Secure, RLS-protected environment",
];

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
    <div className="grid min-h-dvh lg:grid-cols-[45%_55%]">

      {/* ── Brand panel ── */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex"
        style={{ background: "linear-gradient(145deg, #071410 0%, #0e2e28 55%, #0a5852 100%)" }}
      >
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute -right-20 -top-20 h-80 w-80 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(14,110,104,0.35), transparent 65%)" }}
          />
          <div
            className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(14,110,104,0.2), transparent 65%)" }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />
        </div>

        {/* Logo mark */}
        <div className="relative flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-black"
            style={{
              background: "rgba(14,110,104,0.3)",
              border: "1px solid rgba(14,110,104,0.5)",
              color: "var(--color-brand-soft, #dfeceb)",
            }}
          >
            E
          </div>
          <div>
            <p className="text-lg font-bold leading-none tracking-tight" style={{ color: "white" }}>Examia</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>
              {COMPANY_NAME}
            </p>
          </div>
        </div>

        {/* Body copy */}
        <div className="relative space-y-7">
          <h2
            className="text-[30px] font-bold leading-tight tracking-tight"
            style={{ fontFamily: "var(--font-display, var(--font-bricolage))", color: "white" }}
          >
            Start from scratch.<br />
            <span style={{ color: "rgba(255,255,255,0.75)" }}>Finish exam ready.</span>
          </h2>

          <p className="max-w-sm text-[14px] leading-relaxed" style={{ color: "rgba(223,236,235,0.6)" }}>
            Your exam portal — timed tests, live results, and a question bank designed to get you to the score you need.
          </p>

          <div className="space-y-3">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-3">
                <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3.5 3.5L13 4.5" stroke="#dfeceb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-sm" style={{ color: "rgba(223,236,235,0.75)" }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[12px]" style={{ color: "rgba(255,255,255,0.28)" }}>
          Examia · A TechxServe Product
        </p>
      </div>

      {/* ── Form panel ── */}
      <div
        className="flex flex-col items-center justify-center px-6 py-12"
        style={{ background: "var(--color-paper)" }}
      >
        {/* Mobile brand */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-base font-black text-white"
            style={{ background: "var(--color-brand)" }}
          >
            E
          </div>
          <div>
            <p className="font-bold text-ink">Examia</p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-3">{COMPANY_NAME}</p>
          </div>
        </div>

        <div className="w-full max-w-sm">
          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-ink">Welcome back</h1>
            <p className="mt-1 text-sm text-ink-3">Sign in to access your exam portal.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
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

            {error && !lock.isLocked && (
              <p className="rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm font-medium text-error" role="alert">
                {error}
              </p>
            )}
            {lock.isLocked && (
              <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning" role="alert">
                Too many wrong guesses. Try again in{" "}
                <span className="font-mono">{formatCountdown(lock.remainingSeconds)}</span>.
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit || busy}
              className={cn(
                "mt-1 w-full rounded-lg px-4 py-3 text-sm font-bold",
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

            <p className="mt-2 text-center text-xs text-ink-3">
              Locked out? Your teacher has the key.
            </p>
          </form>

          {/* TechxServe attribution */}
          <div className="mt-10 border-t border-border pt-6 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-3 mb-3">A TechxServe Product</p>
            <div className="flex items-center justify-center gap-3 text-sm font-semibold">
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
        </div>

        {/* Hidden admin hotspot */}
        <button
          onClick={() => router.push("/admin")}
          aria-label="Administrator access"
          title=""
          className="mt-6 h-8 w-24 rounded opacity-0"
          tabIndex={-1}
        />
      </div>
    </div>
  );
}
