"use client";

import { useEffect } from "react";

// The other half of OpenInOwnWindow: when the exam was sat in its own window,
// handing in closes that window and refreshes the dashboard behind it, so the
// student is returned to where they started with the attempt already showing.
//
// `window.opener` is the test for "this is the exam window". Reaching a result
// any other way -- opening an old attempt from the dashboard, or sitting the
// mock in the same tab because JavaScript or the popup was blocked -- leaves
// `opener` null and this does nothing at all.
//
// The opener is same-origin, so it can simply be reloaded; no BroadcastChannel
// and no message passing is needed. Both calls are wrapped because a closed or
// navigated-away opener throws rather than returning null.
export function CloseOnSubmit() {
  useEffect(() => {
    const opener = window.opener as Window | null;
    if (!opener) return;
    try {
      if (!opener.closed) opener.location.reload();
    } catch {
      // Opener gone or cross-origin: nothing to refresh, still close.
    }
    try {
      window.close();
    } catch {
      // A window the script did not open cannot be closed. The student simply
      // keeps the result on screen, which is no worse than before.
    }
  }, []);

  return null;
}
