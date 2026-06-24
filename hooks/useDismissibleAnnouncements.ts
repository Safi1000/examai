"use client";

import { useMemo } from "react";
import type { Announcement, Student } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { announcementsForStudent } from "@/lib/data/selectors";

/**
 * Splits a student's announcements into always-visible pinned ones and
 * dismissible unpinned ones, hiding any the student already dismissed.
 * Dismissal persists per-student through the data seam.
 */
export function useDismissibleAnnouncements(student: Student) {
  const db = useDatabase();
  const store = useStore();

  const { pinned, dismissible } = useMemo(() => {
    const all = announcementsForStudent(db, student).sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
    const pinned: Announcement[] = all.filter((a) => a.pinned);
    const dismissible: Announcement[] = all.filter(
      (a) => !a.pinned && !a.dismissedBy.includes(student.id),
    );
    return { pinned, dismissible };
  }, [db, student]);

  const dismiss = (id: string) => store.dismissAnnouncement(id, student.id);

  return { pinned, dismissible, dismiss };
}
