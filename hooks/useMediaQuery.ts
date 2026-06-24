"use client";

import { useEffect, useState } from "react";

/** Reactive media-query boolean. SSR-safe (returns false until mounted). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** Convenience breakpoints matching the spec (<640 phone, 640–1024 tablet). */
export const usePhone = () => useMediaQuery("(max-width: 639px)");
export const useDesktop = () => useMediaQuery("(min-width: 1024px)");
