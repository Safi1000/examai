"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { applyTheme } from "@/lib/theme";

/**
 * Applies the current accent theme to the document whenever it changes (initial
 * device cache, then the user's server-stored preference once the session
 * resolves). Mounted once inside AuthProvider.
 */
export function ThemeManager() {
  const { themeId } = useAuth();
  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);
  return null;
}
