"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { recordProctorEvent } from "../actions/proctor-actions";
import { proctorEventLabels as describe, type ProctorEventType } from "../proctor";

// Warn and log, never submit (operating manual §13.1). A Windows notification
// stealing focus must not end a real student's exam, so nothing here does more
// than record the event and tell the student it was recorded.
//
// Only rendered for a proctored attempt on a mock with proctoring on. A phone
// attempt is unproctored for good, and gets none of this (Annexure B excludes
// proctoring on phones).
export function ProctorWatch({ attemptId }: { attemptId: number }) {
  const [banner, setBanner] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(true);
  const last = useRef<Record<string, number>>({});

  const record = useCallback(
    (type: ProctorEventType) => {
      // One of each kind per few seconds: a tab switch also blurs the window,
      // and a burst of identical rows helps nobody reading the record.
      const now = Date.now();
      if (now - (last.current[type] ?? 0) < 5000) return;
      last.current[type] = now;
      void recordProctorEvent(attemptId, type).then((saved) => {
        setBanner(saved ? `${describe[type]} was recorded.` : `${describe[type]} was noticed.`);
      });
    },
    [attemptId],
  );

  useEffect(() => {
    setFullscreen(Boolean(document.fullscreenElement));
    const onFullscreen = () => {
      const inside = Boolean(document.fullscreenElement);
      setFullscreen(inside);
      if (!inside) record("fullscreen_exit");
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") record("tab_hidden");
    };
    const onBlur = () => {
      // A hidden tab also blurs; count it once, as the tab switch.
      if (document.visibilityState === "visible") record("window_blur");
    };
    const onCopy = () => record("copy");
    const onPaste = () => record("paste");

    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [record]);

  return (
    <div role="status">
      {banner ? (
        <p className="notice notice--error">
          {banner} This test is proctored: activity away from it is logged for your mentor and admin. Your test has not been
          ended.
        </p>
      ) : null}
      {fullscreen ? null : (
        <p className="notice">
          This test is proctored and should be taken in full screen.{" "}
          <button
            className="button button--secondary button--compact"
            onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
            type="button"
          >
            Enter full screen
          </button>
        </p>
      )}
    </div>
  );
}
