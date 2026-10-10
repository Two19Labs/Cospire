import type { ReactNode } from "react";

import { ActionBoundary } from "@/shared/ui";

import styles from "./exam.module.css";

// The exam's own frame: the whole viewport, an ink bar with the mock's name,
// and nothing of the application around it -- no sidebar, no header, no link
// away. Every screen of a sitting draws inside it, so moving from a question to
// "Next section" or "Time is up" never flashes the application shell.
export function ExamFrame({ children, right, sub, title }: { children: ReactNode; right?: ReactNode; sub?: string; title: string }) {
  return (
    <div className={styles.exam}>
      <header className={styles.top}>
        <span aria-hidden="true" className={styles.brand}>
          C
        </span>
        <span aria-hidden="true" className={styles.divider} />
        <span className={styles.title}>{title}</span>
        {sub ? <span className={styles.sub}>{sub}</span> : null}
        <span className={styles.spacer} />
        {right}
      </header>
      <ActionBoundary>{children}</ActionBoundary>
    </div>
  );
}

// One card in the middle of the frame: time up, the next section, a confirm.
export function ExamCard({ children, eyebrow }: { children: ReactNode; eyebrow?: string }) {
  return (
    <main className={styles.centre}>
      <section className={styles.card}>
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        {children}
      </section>
    </main>
  );
}
