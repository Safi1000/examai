"use client";

import { useState } from "react";
import type { Rubric, Student, Submission, Test } from "@/types";
import { Button, Icon } from "@/components/ui";
import { useToast } from "@/components/toast";
import { gradeSubmission } from "@/lib/grading";
import { PASS_PERCENT } from "@/components/pdf/Certificate";

/**
 * Download buttons for the branded result report and (when passed) the
 * completion certificate. @react-pdf/renderer is heavy, so both it and the PDF
 * documents are dynamically imported on click — they never touch the initial
 * results-page bundle and only ever run in the browser (no SSR).
 */
export function ResultPdfActions({
  student,
  test,
  submission,
  rubrics,
}: {
  student: Student;
  test: Test;
  submission: Submission;
  rubrics: Rubric[];
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"report" | "certificate" | null>(null);

  const passed = gradeSubmission(test, submission).percent >= PASS_PERCENT;
  const safeName = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();

  function saveBlob(blob: Blob, suffix: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName(test.testCode)}-${safeName(student.username)}-${suffix}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after the click has had a tick to start the download (Safari-safe).
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function download(kind: "report" | "certificate") {
    setBusy(kind);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      if (kind === "report") {
        const { ResultReport } = await import("@/components/pdf/ResultReport");
        const blob = await pdf(
          <ResultReport student={student} test={test} submission={submission} rubrics={rubrics} />,
        ).toBlob();
        saveBlob(blob, "report");
      } else {
        const { Certificate } = await import("@/components/pdf/Certificate");
        const blob = await pdf(<Certificate student={student} test={test} submission={submission} />).toBlob();
        saveBlob(blob, "certificate");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't generate the PDF. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button
        variant="secondary"
        size="sm"
        loading={busy === "report"}
        disabled={busy !== null}
        onClick={() => download("report")}
      >
        <Icon.Download className="h-4 w-4" /> Download report
      </Button>
      {passed && (
        <Button
          variant="secondary"
          size="sm"
          loading={busy === "certificate"}
          disabled={busy !== null}
          onClick={() => download("certificate")}
        >
          <Icon.Award className="h-4 w-4" /> Download certificate
        </Button>
      )}
    </div>
  );
}
