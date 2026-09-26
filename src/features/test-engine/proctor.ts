// The proctoring events a browser can report. Must match the
// `proctor_events_type_valid` CHECK in 20260926103000_test_engine_attempts.sql.
export const proctorEventTypes = ["fullscreen_exit", "tab_hidden", "window_blur", "copy", "paste"] as const;
export type ProctorEventType = (typeof proctorEventTypes)[number];

export const proctorEventLabels: Record<ProctorEventType, string> = {
  copy: "Copying",
  fullscreen_exit: "Leaving full screen",
  paste: "Pasting",
  tab_hidden: "Switching away from the tab",
  window_blur: "Moving to another window",
};
