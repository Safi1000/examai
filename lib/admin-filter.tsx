"use client";

import { createContext, useContext, useMemo, useState } from "react";

interface AdminFilterValue {
  /** null = all cohorts */
  cohortId: string | null;
  setCohortId: (id: string | null) => void;
}

const Ctx = createContext<AdminFilterValue | null>(null);

export function AdminFilterProvider({ children }: { children: React.ReactNode }) {
  const [cohortId, setCohortId] = useState<string | null>(null);
  const value = useMemo(() => ({ cohortId, setCohortId }), [cohortId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminFilter(): AdminFilterValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdminFilter must be used within AdminFilterProvider");
  return ctx;
}
