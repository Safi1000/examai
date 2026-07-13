"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/lib/data/store";
import { Modal, Button, Input } from "@/components/ui";

const MIN_LENGTH = 8;

/**
 * Mandatory, non-dismissible dialog shown when a student is still on the
 * temporary password an admin gave them. Blocks every student route until they
 * set their own password. Gated at the (student) layout on
 * `auth.mustChangePassword`.
 */
export function ForceChangePasswordDialog() {
  const { clearMustChangePassword } = useAuth();
  const store = useStore();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await store.changePassword(password);
    if (ok) {
      clearMustChangePassword(); // dialog unmounts once the flag flips
    } else {
      setError("Couldn't update your password. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      dismissible={false}
      onClose={() => {}}
      title="Set a new password"
      description="You're logged in with a temporary password. Please set a new password to continue."
      footer={
        <Button type="submit" form="force-change-password" loading={busy} fullWidth>
          Save & continue
        </Button>
      }
    >
      <form id="force-change-password" onSubmit={onSubmit} className="space-y-4">
        <Input
          type="password"
          label="New password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          hint={`At least ${MIN_LENGTH} characters.`}
          autoComplete="new-password"
          autoFocus
          required
        />
        <Input
          type="password"
          label="Confirm password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(null); }}
          autoComplete="new-password"
          required
        />
        {error && (
          <p className="rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm font-medium text-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
