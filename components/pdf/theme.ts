/**
 * Concrete hex values mirroring the "Almanac" design tokens in globals.css.
 *
 * @react-pdf/renderer renders outside the DOM, so it can't read the CSS custom
 * properties the rest of the app themes from — it needs literal colors. Keep
 * these in lockstep with the @theme block in app/globals.css so a downloaded PDF
 * matches the on-screen identity.
 */
export const pdf = {
  paper: "#f4f1e9",
  surface: "#fcfaf4",
  surface2: "#ece7da",
  border: "#ded7c7",
  borderStrong: "#c9c0ac",
  ink: "#23211c",
  ink2: "#57534a",
  ink3: "#8b8676",
  brand: "#0e6e68",
  brandStrong: "#0a5852",
  brandSoft: "#dfeceb",
  onBrand: "#fcfaf4",
  success: "#267a4b",
  successSoft: "#e1efe6",
  warning: "#a76a0c",
  warningSoft: "#f4e9d2",
  error: "#b23a2e",
  errorSoft: "#f5e0db",
  info: "#345c8f",
  infoSoft: "#e1e9f2",
} as const;

/** Semantic role → {text, soft-bg} pair, matching the app's badge tones. */
export function roleColors(role: "success" | "warning" | "error"): { fg: string; bg: string } {
  if (role === "success") return { fg: pdf.success, bg: pdf.successSoft };
  if (role === "warning") return { fg: pdf.warning, bg: pdf.warningSoft };
  return { fg: pdf.error, bg: pdf.errorSoft };
}
