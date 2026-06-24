"use client";

import { Card } from "@/components/ui";
import { ThemeSettings } from "@/components/ThemeSettings";

export default function StudentSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Settings</h1>
      <p className="mt-1 text-sm text-ink-2">Personalise how your portal looks.</p>

      <Card className="mt-5 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-2">Accent colour</h2>
        <p className="mb-4 mt-1 text-sm text-ink-3">
          Choose the highlight colour used across your app. Saved on this device.
        </p>
        <ThemeSettings />
      </Card>
    </div>
  );
}
