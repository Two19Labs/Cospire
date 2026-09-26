import Link from "next/link";
import type { ReactNode } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/shared/ui";

import { formatMarks, percent, type Tally } from "../aggregate";
import type { Breakdown } from "../queries/views";
import styles from "./analytics.module.css";

export const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

// A share drawn as a bar, with the number printed beside it. The bar is
// decoration for the eye (aria-hidden); the printed value is what is read.
export function Bar({ label, share, weak = false }: { label: string; share: number | null; weak?: boolean }) {
  const width = share === null ? 0 : Math.max(0, Math.min(1, share)) * 100;
  return (
    <span className={styles.barCell}>
      <span className={styles.barValue}>{label}</span>
      <span aria-hidden="true" className={styles.track}>
        <span className={`${styles.fill}${weak ? ` ${styles.fillWeak}` : ""}`} style={{ width: `${width}%` }} />
      </span>
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.stat}>
      <strong>{value}</strong>
      {label}
    </div>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <div className={styles.stats}>{children}</div>;
}

export function TallyTable({ heading, rows }: { heading: string; rows: Tally[] }) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>{heading}</TableHeaderCell>
          <TableHeaderCell>Questions</TableHeaderCell>
          <TableHeaderCell>Correct</TableHeaderCell>
          <TableHeaderCell>Wrong</TableHeaderCell>
          <TableHeaderCell>Not answered</TableHeaderCell>
          <TableHeaderCell>Accuracy</TableHeaderCell>
          <TableHeaderCell>Marks</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableCell>{row.label}</TableCell>
            <TableCell className={styles.num}>{row.questions}</TableCell>
            <TableCell className={styles.num}>{row.correct}</TableCell>
            <TableCell className={styles.num}>{row.wrong}</TableCell>
            <TableCell className={styles.num}>{row.unattempted}</TableCell>
            <TableCell>
              <Bar label={percent(row.accuracy)} share={row.accuracy} />
            </TableCell>
            <TableCell className={styles.num}>
              {formatMarks(row.marksScored)} / {formatMarks(row.marksAvailable)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Accuracy is correct out of attempted, as CAT reports it; unattempted
// questions show in their own column rather than dragging accuracy down.
export function BreakdownPanels({ breakdown }: { breakdown: Breakdown }) {
  return (
    <>
      <section className="panel">
        <h2>By section</h2>
        <TallyTable heading="Section" rows={breakdown.bySection} />
      </section>
      <section className="panel">
        <h2>By topic</h2>
        <TallyTable heading="Topic" rows={breakdown.byTopic} />
      </section>
      <section className="panel">
        <h2>By difficulty</h2>
        <TallyTable heading="Difficulty" rows={breakdown.byDifficulty} />
      </section>
    </>
  );
}

export function Pager({ href, page, total, size }: { href: (page: number) => string; page: number; size: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="pagination">
      {page > 1 ? <Link href={href(page - 1)} rel="prev">Previous</Link> : <span className="muted">Previous</span>}
      <span className="muted">Page {page} of {pages}</span>
      {page < pages ? <Link href={href(page + 1)} rel="next">Next</Link> : <span className="muted">Next</span>}
    </nav>
  );
}
