"use client";

import { Component, useEffect, type ReactNode } from "react";

// Keeps the screen on view while a form's Server Action redirects.
//
// Nearly every form here ends its action with `redirect()` back to the same
// screen carrying a notice, which is what makes it work without JavaScript.
// With JavaScript, React hands that redirect to the nearest error boundary, and
// the one Next.js puts round every page draws NOTHING until the follow-up
// navigation has fetched and rendered the target. Measured in the 2026-10-09 UI
// audit: the page went blank for one to several seconds after "Grant access",
// "Save component", "Add section" and every other save -- long enough to read
// as a crash.
//
// This boundary sits nearer the forms than Next's does, catches only redirect
// errors, and follows the redirect as a plain browser navigation while keeping
// the screen the person was looking at, dimmed and inert so it cannot be
// clicked twice, with a status line for screen readers. The browser keeps
// painting it until the new document arrives, so there is no blank frame. Any
// other error, including not-found, is rethrown to the boundaries above
// unchanged, and the redirect target is followed exactly, so access-enforcing
// redirects behave as before.
//
// **It used to follow the redirect through the client router, and that was
// defect C2.** `router.push(url)` inside a transition, then `reset()`: on about
// 70% of clicks the reset never took effect and the screen stayed dimmed and
// unclickable for good, although the write had landed and the new content was
// on screen. Instrumented and measured on 2026-10-16 (see
// docs/context/completed.md): the boundary re-renders with `redirect: null`
// but that render never commits, because the transition `router.push` starts
// never settles, and nothing inside this subtree commits again afterwards to
// carry the reset. Resetting earlier is not available either -- remounting the
// children while React is still streaming the target in throws inside
// react-dom. A browser navigation needs no reset at all: the document is
// replaced, so the state cannot be left behind. It costs a full load per save,
// median 1.2s against the hosted database, where the client-router path was
// 0.7s when it worked and never finished when it did not.

interface Redirect {
  type: "push" | "replace";
  url: string;
}

// Next's redirect error carries `NEXT_REDIRECT;<type>;<url>;<status>;` as its
// digest. Parsed here rather than imported from `next/dist`, which is not a
// public entry point.
function redirectOf(error: unknown): Redirect | null {
  const digest = typeof error === "object" && error !== null && "digest" in error ? (error as { digest: unknown }).digest : null;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT;")) return null;
  const parts = digest.split(";");
  const type = parts[1] === "replace" ? "replace" : "push";
  const url = parts.slice(2, -2).join(";");
  return url ? { type, url } : null;
}

// `replace` keeps the action's own semantics: a redirect the person must not be
// able to come back to with the back button stays out of the history.
function FollowRedirect({ redirect }: { redirect: Redirect }) {
  useEffect(() => {
    if (redirect.type === "replace") window.location.replace(redirect.url);
    else window.location.assign(redirect.url);
  }, [redirect]);
  return null;
}

class Boundary extends Component<{ children: ReactNode }, { redirect: Redirect | null }> {
  state: { redirect: Redirect | null } = { redirect: null };

  static getDerivedStateFromError(error: unknown) {
    const redirect = redirectOf(error);
    if (!redirect) throw error;
    return { redirect };
  }

  render() {
    const { redirect } = this.state;
    // The wrapper is always drawn, `display: contents`, so starting a redirect
    // changes attributes rather than the tree: nothing remounts. The state is
    // deliberately terminal -- the navigation replaces the document, so there
    // is nothing to reset and no reset to lose.
    return (
      <div aria-busy={redirect ? true : undefined} className="action-boundary" inert={redirect ? true : undefined}>
        {redirect ? <FollowRedirect redirect={redirect} /> : null}
        {redirect ? (
          <span className="visually-hidden" role="status">
            Updating the page…
          </span>
        ) : null}
        {this.props.children}
      </div>
    );
  }
}

export function ActionBoundary({ children }: { children: ReactNode }) {
  return <Boundary>{children}</Boundary>;
}
