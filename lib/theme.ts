import type { Session } from "@/types";

export interface ThemeOption {
  id: string;
  name: string;
  brand: string;
  brandStrong: string;
  brandSoft: string;
  onBrand: string;
}

export const THEMES: ThemeOption[] = [
  { id: "gold",   name: "Gold",      brand: "#FBC159", brandStrong: "#e5a832", brandSoft: "#2e2510", onBrand: "#1a1d20" },
  { id: "teal",   name: "Teal",      brand: "#6FBBA8", brandStrong: "#53a18e", brandSoft: "#162926", onBrand: "#1a1d20" },
  { id: "coral",  name: "Coral",     brand: "#E5685A", brandStrong: "#cc4e40", brandSoft: "#2c1512", onBrand: "#f0ede8" },
  { id: "blue",   name: "Sky Blue",  brand: "#6a9fd8", brandStrong: "#5288c2", brandSoft: "#182436", onBrand: "#1a1d20" },
  { id: "indigo", name: "Indigo",    brand: "#8b9de8", brandStrong: "#7080d4", brandSoft: "#1e2040", onBrand: "#1a1d20" },
  { id: "slate",  name: "Slate",     brand: "#7a9dba", brandStrong: "#608399", brandSoft: "#1e2b35", onBrand: "#1a1d20" },
];

export const DEFAULT_THEME_ID = "gold";

export function themeById(id: string | null | undefined): ThemeOption {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function themeUserKey(session: Session | null): string {
  if (!session) return "guest";
  if (session.role === "admin") return "admin";
  return session.studentId ? `st:${session.studentId}` : "guest";
}

const storageKey = (userKey: string) => `examia.theme.${userKey}`;
const LAST_KEY = "examia.theme.last";

export function loadThemeId(userKey: string): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    return window.localStorage.getItem(storageKey(userKey)) || DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function loadLastThemeId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    return window.localStorage.getItem(LAST_KEY) || DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function saveThemeId(userKey: string, id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userKey), id);
    window.localStorage.setItem(LAST_KEY, id);
  } catch {
    /* ignore */
  }
}

export function applyTheme(id: string): void {
  if (typeof document === "undefined") return;
  const t = themeById(id);
  const s = document.documentElement.style;
  s.setProperty("--color-brand", t.brand);
  s.setProperty("--color-brand-strong", t.brandStrong);
  s.setProperty("--color-brand-soft", t.brandSoft);
  s.setProperty("--color-on-brand", t.onBrand);
  s.setProperty("--ruled-margin", t.brand);
}
