"use client";

import { useFormStatus } from "react-dom";

import styles from "./pending-overlay.module.css";

// A real loading state for a save that takes seconds (D12): the page is covered
// and says what is happening, instead of only the button's label changing --
// which on a long mock or a large import read as nothing having happened.
// Must sit inside the form it reports on. Without JavaScript it renders
// nothing and the browser shows its own progress, as before.
export function PendingOverlay({ detail, label }: { detail?: string; label: string }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <div aria-live="assertive" className={styles.scrim} role="alert">
      <div className={styles.card}>
        <span aria-hidden="true" className={styles.spinner} />
        <div>
          <strong>{label}</strong>
          <span className="muted">{detail ?? "This can take a little while. Keep this tab open."}</span>
        </div>
      </div>
    </div>
  );
}
