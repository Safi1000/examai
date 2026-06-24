"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Authed admins land on Tests; unauthenticated visitors see the login (layout). */
export default function AdminIndex() {
  const router = useRouter();
  useEffect(() => router.replace("/admin/tests"), [router]);
  return null;
}
