"use client";

import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui";
import { ThemeSettings } from "@/components/ThemeSettings";

export default function AdminSettingsPage() {
  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader title="Settings" subtitle="Personalise your console" />
      <Card className="max-w-2xl">
        <CardHeader><h2 className="font-bold text-ink">Accent colour</h2></CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-ink-3">
            Choose the highlight colour used across the console. Saved on this device.
          </p>
          <ThemeSettings />
        </CardBody>
      </Card>
    </div>
  );
}
