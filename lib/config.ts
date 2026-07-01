/**
 * Single source of truth for brand surfacing.
 * Swap COMPANY_NAME and the slug derives automatically; it appears on the
 * login hero, the admin header, and the export filename.
 */
export const COMPANY_NAME = "";

export const COMPANY_SLUG = "examia";

/** Persistent build credit shown on every screen. */
export const BUILD_CREDIT = "Developed by Techxserve";

/**
 * Auth wiring. Students log in by username only, so we mint a synthetic auth
 * email `${username}@${STUDENT_EMAIL_DOMAIN}`. The admin UI asks only for a
 * password and signs into ADMIN_EMAIL. Both must agree with the seeded users
 * and the admin-users edge function (which hardcodes the same domain).
 */
export const STUDENT_EMAIL_DOMAIN =
  process.env.NEXT_PUBLIC_STUDENT_EMAIL_DOMAIN || "students.examia.local";

export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@examia.local";

export const studentEmail = (username: string) =>
  `${username.trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;

/** Cloudinary unsigned upload target (see lib/cloudinary.ts). */
export const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD || "";
export const CLOUDINARY_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_PRESET || "examia_submissions";
/** Separate preset for notes (resource_type: auto to support PDFs, docx, etc.). */
export const CLOUDINARY_NOTES_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_NOTES_PRESET || "examia_notes";
