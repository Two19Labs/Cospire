import type { Metadata } from "next";
import { Figtree, Inter } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

// Self-hosted at build time by next/font, not fetched from Google at runtime.
//
// Three reasons that matters here rather than being a detail. Students' browsers
// never call a Google server, so there is no third-party request carrying their
// IP address to explain to the Client. The font is inlined into the build, so
// there is no layout shift on a slow connection at a coaching centre. And the
// deployment has one fewer external dependency that can be slow or blocked.
//
// Inter, body and headings alike (2026-10-10, pending the Client's approval).
// Figtree, the earlier body face, is still loaded but never preloaded: the
// browser fetches it only when `data-font="original"` applies it, which only
// the development-only switch does. globals.css maps both onto --font-sans.
const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
});

const figtree = Figtree({
  display: "swap",
  preload: false,
  subsets: ["latin"],
  variable: "--font-figtree",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  description: "Cospire learning and assessment platform",
  title: {
    default: "Cospire LMS",
    template: "%s | Cospire LMS",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className={`${inter.variable} ${figtree.variable}`} lang="en">
      <body>{children}</body>
    </html>
  );
}
