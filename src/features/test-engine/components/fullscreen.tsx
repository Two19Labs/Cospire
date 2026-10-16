"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./exam.module.css";

function enter() {
  // Refused without a click behind it, and absent on iPhone; either way the
  // exam carries on, and the button stays for the student to press.
  void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

// Asks for full screen as the form it sits in is submitted -- the Start and
// Begin buttons -- because a browser grants full screen only inside a click.
// The page that follows is a client-side navigation, so the document, and its
// full screen, carry over into the exam. Without JavaScript it does nothing.
//
// **Measured, not assumed** (`scripts/verify/exam-fullscreen.mjs`, 2026-10-16).
// PR #80 made `ActionBoundary` follow a caught redirect with `window.location`
// and a document load always exits full screen, so this looked doomed. It is
// not: a redirect from a Server Action dispatched by React is followed by the
// client router and never reaches the boundary, so Start, Begin and the
// section change all stay inside one document and keep the full screen. Only
// the countdown's native form post left it, and that post is gone.
//
// Nothing relies on this surviving, though. The mock is to open in a window of
// its own shortly, and full screen will then have to be asked for by a click
// inside that window: `ProctorWatch`'s banner carries one for a proctored
// attempt and `FullscreenButton` sits in the exam bar for the rest.
export function FullscreenOnSubmit() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    form.addEventListener("submit", enter);
    return () => form.removeEventListener("submit", enter);
  }, []);
  return <span hidden ref={marker} />;
}

// A button in the exam's bar, shown while the page is not in full screen.
export function FullscreenButton() {
  const [inside, setInside] = useState(true);
  useEffect(() => {
    const update = () => setInside(Boolean(document.fullscreenElement) || !document.fullscreenEnabled);
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  if (inside) return null;
  return (
    <button className={styles.topButton} onClick={enter} type="button">
      Enter full screen
    </button>
  );
}
