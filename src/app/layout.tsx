import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
// Inter, body and headings alike: the Client chose it over Figtree and the
// serif on 2026-10-12. globals.css maps it onto --font-sans and --font-serif.
const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
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
    <html className={inter.variable} lang="en">
      <body>{children}</body>
    </html>
  );
}
