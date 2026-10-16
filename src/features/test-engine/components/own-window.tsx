"use client";

import { useEffect, useRef } from "react";

// The one name the exam ever uses, so a second Start reuses that window rather
// than opening a pile of them.
const EXAM_WINDOW = "cospire-exam";

// The flag the opener puts on the URL it hands the new window. `window.opener`
// is checked alongside it, so a bookmarked or shared `?start=1` link does
// nothing at all.
const START_FLAG = "start";

// A mock opens in its own window on Start, so the dashboard stays where the
// student left it and the exam gets a window with nothing else in it.
//
// Two things a browser does made the obvious shapes of this not work, both
// measured in headless Chrome against a production build rather than reasoned
// from the markup:
//
//   1. **A server action ignores `form.target`.** React submits a server action
//      with `fetch`, so the form is never natively submitted and its `target`
//      is never consulted. Setting it opens the attempt in the dashboard tab
//      and leaves an empty popup behind, which is worse than not trying.
//   2. **A click carries one transient user activation**, and full screen and
//      the popup compete for it. `requestFullscreen()` consumes it, and the
//      `window.open()` that follows is then refused.
//
// So this component does not touch the form's `target` and does not race
// `FullscreenOnSubmit`. It intercepts the **click**, in the capture phase,
// before any submit event exists:
//
//   - Window opened: the click is cancelled, so this tab never submits and
//     `FullscreenOnSubmit` never runs -- the window is the containment, full
//     screen is not wanted as well. The new window loads this same screen with
//     `?start=1` and submits the Start form itself, under its own session, so
//     the server action and the phone check are exactly the ones already there.
//   - Window refused, or no JavaScript at all: the click is left alone and the
//     attempt opens in this tab, full screen and all, unchanged from before.
//     That is the required fallback.
export function OpenInOwnWindow({ mockId }: { mockId: number }) {
  const marker = useRef<HTMLSpanElement>(null);
  // Built here rather than by a helper this module exports: every export of a
  // "use client" module is a client reference, and calling one during the
  // server render throws.
  const href = `/student/mocks/${mockId}?${START_FLAG}=1`;

  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;

    // This *is* the exam window, opened by the branch below. Start at once.
    if (window.opener && new URLSearchParams(window.location.search).get(START_FLAG) === "1") {
      form.requestSubmit();
      return;
    }

    const onClick = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest("button")) return;
      const win = window.open(href, EXAM_WINDOW, "popup,width=1280,height=900");
      if (!win) return; // Popup refused: submit here, as the button always did.
      win.focus();
      // Cancelled in capture, so no submit event is ever dispatched.
      event.preventDefault();
      event.stopPropagation();
    };

    form.addEventListener("click", onClick, true);
    return () => form.removeEventListener("click", onClick, true);
  }, [href]);

  return <span hidden ref={marker} />;
}
