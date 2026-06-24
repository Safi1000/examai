import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { COMPANY_NAME } from "@/lib/config";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});

const splineMono = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-spline-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${COMPANY_NAME} — Exam & Cohort Portal`,
  description: "A calm, mobile-first exam and cohort-management portal.",
};

export const viewport: Viewport = {
  themeColor: "#f4f1e9",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${hanken.variable} ${splineMono.variable} h-full`}
    >
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
