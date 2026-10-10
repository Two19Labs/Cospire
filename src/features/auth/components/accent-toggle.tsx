"use client";

import { useEffect, useState } from "react";

// A development-only switch between the two accent candidates, plain rust and
// the brighter rust, so the owner can compare them on localhost. RoleShell
// renders it only when NODE_ENV is "development"; a production build draws
// plain rust and no switch.
//
// It sets `data-accent` on <html>, which swaps the accent variables in
// globals.css. The choice is kept in localStorage, inside try/catch because
// storage can be blocked.

type Accent = "plain" | "bright";

const storageKey = "cospire-accent";

function apply(accent: Accent) {
  if (accent === "bright") document.documentElement.dataset.accent = "bright";
  else delete document.documentElement.dataset.accent;
}

export function AccentToggle() {
  const [accent, setAccent] = useState<Accent>("plain");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(storageKey);
    } catch {
      saved = null;
    }
    const initial: Accent = saved === "bright" ? "bright" : "plain";
    setAccent(initial);
    apply(initial);
  }, []);

  function toggle() {
    const next: Accent = accent === "bright" ? "plain" : "bright";
    setAccent(next);
    apply(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Storage blocked: the switch still works for this page view.
    }
  }

  return (
    <button className="accent-toggle" onClick={toggle} type="button">
      <span aria-hidden="true" className="accent-toggle__swatch" />
      Accent: {accent === "bright" ? "bright rust" : "plain rust"} (dev only)
    </button>
  );
}
