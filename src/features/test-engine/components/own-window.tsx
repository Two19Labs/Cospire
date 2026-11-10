"use client";

import type { ReactNode } from "react";

// The one name the exam ever uses, so a second click reuses that window rather
// than opening a pile of them.
const EXAM_WINDOW = "cospire-exam";

// "Attempt mock" opens the mock's instructions in a window of its own, so the
// dashboard stays where the student left it. The attempt, and its clock, start
// only from the Start button on that page.
//
// It is a plain link underneath: with the popup refused, or no JavaScript, the
// instructions open in this tab instead. A phone opens them in a new tab.
export function AttemptLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <a
      className="button button--primary"
      href={href}
      onClick={(event) => {
        const win = window.open(href, EXAM_WINDOW, "popup,width=1280,height=900");
        if (!win) return; // Refused: follow the link here.
        win.focus();
        event.preventDefault();
      }}
    >
      {children}
    </a>
  );
}
