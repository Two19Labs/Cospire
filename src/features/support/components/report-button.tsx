"use client";

import { useState } from "react";

import { Dialog } from "@/shared/ui";

import { ReportForm } from "./report-form";
import styles from "./report-button.module.css";

// "Report a mistake", fixed at the bottom right of every student screen drawn
// by the role shell. The exam window (ExamFrame) does not use the shell, so the
// button never sits over the exam's controls; a document or video in full
// screen covers it, because only the full-screen element is drawn.
//
// The page is read when the dialog opens, path and query, so it names exactly
// what the student was looking at.
export function ReportButton() {
  const [page, setPage] = useState<string | null>(null);
  const [opened, setOpened] = useState(0);

  return (
    <>
      <button
        className={`button button--secondary ${styles.fab}`}
        onClick={() => {
          setPage(`${window.location.pathname}${window.location.search}`);
          setOpened((count) => count + 1);
        }}
        type="button"
      >
        Report a mistake
      </button>
      <Dialog onOpenChange={(open) => (open ? null : setPage(null))} open={page !== null} title="Report a mistake">
        {page !== null ? (
          <>
            <p className="muted">Spotted a wrong answer, a typo or a broken item? It goes to the Cospire team with this page attached.</p>
            <ReportForm key={opened} kind="mistake" page={page} />
          </>
        ) : null}
      </Dialog>
    </>
  );
}
