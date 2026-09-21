import type { ReactNode } from "react";

import { requireRole } from "@/features/auth/guards";

// The role guard for every student route, run in the layout rather than only in
// each page.
//
// It has to be here because of `loading.tsx`. A loading file wraps the PAGE in
// a Suspense boundary, so the response starts streaming -- headers and skeleton
// already sent -- before the page's own `requireRole` runs. A `redirect()`
// decided at that point can no longer be an HTTP redirect, so Next delivers it
// through a script in the body instead. With JavaScript disabled that is no
// redirect at all: a student pointed at an admin URL would sit and watch an
// admin skeleton shimmer for ever.
//
// A layout renders OUTSIDE its segment's Suspense boundary, so the guard runs
// before anything is sent and the wrong role gets a real 307 again, script or
// no script. Every screen in this application is built to work without
// JavaScript, and that is not a rule worth losing to a loading animation.
//
// The pages still call `requireRole` for the profile they render. That costs
// nothing extra: `getSessionState` is wrapped in React's per-request cache, so
// the layout and the page share one token verification and one profile query.
export default async function StudentLayout({ children }: { children: ReactNode }) {
  await requireRole("student");
  return children;
}
