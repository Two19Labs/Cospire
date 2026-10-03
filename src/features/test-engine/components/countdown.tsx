"use client";

import { useEffect, useState } from "react";

import styles from "./exam.module.css";

// The countdown on screen. **Decoration** (operating manual §1.1): the database
// refuses late answers whatever this shows. It is drawn from the server's
// deadline, corrected for the gap between the server's clock and this device's,
// so a wrong clock on the student's laptop does not show them wrong time.
//
// At zero it submits `formId` -- moving to the next section or closing the
// paper -- so a student who is watching is taken on. Without JavaScript the
// next click finds the server has already moved on.
export function Countdown({
  deadline,
  formId,
  serverNow,
  submitterId,
}: {
  deadline: string;
  formId: string;
  serverNow: string;
  // A hidden button in the form whose name and value tell the server why it
  // was submitted.
  submitterId?: string;
}) {
  // Starts at the server's own reading, so the page shows the time left even
  // before (or without) JavaScript; the tick then keeps it current.
  const [left, setLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(deadline).getTime() - new Date(serverNow).getTime()) / 1000)),
  );

  useEffect(() => {
    const skew = new Date(serverNow).getTime() - Date.now();
    const end = new Date(deadline).getTime();
    let fired = false;
    const tick = () => {
      const seconds = Math.max(0, Math.floor((end - (Date.now() + skew)) / 1000));
      setLeft(seconds);
      if (seconds === 0 && !fired) {
        fired = true;
        const form = document.getElementById(formId);
        const submitter = submitterId ? document.getElementById(submitterId) : null;
        if (form instanceof HTMLFormElement) {
          form.requestSubmit(submitter instanceof HTMLButtonElement ? submitter : undefined);
        }
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [deadline, formId, serverNow, submitterId]);

  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, "0");
  return (
    <span
      aria-label={`${minutes} minutes ${seconds} seconds left`}
      aria-live={left <= 60 ? "polite" : "off"}
      className={left <= 300 ? `${styles.clock} ${styles.clockLow}` : styles.clock}
      role="timer"
    >
      {minutes}:{seconds}
    </span>
  );
}
