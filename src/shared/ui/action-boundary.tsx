"use client";

import { Component, startTransition, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

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
// errors, and does exactly what Next's own handler does -- push or replace to
// the target inside a transition, then reset -- except that while it waits it
// keeps the screen the person was looking at, dimmed and inert so it cannot be
// clicked twice, with a status line for screen readers. When the navigation
// commits, the new screen replaces it in one step. Any other error, including
// not-found, is rethrown to the boundaries above unchanged, and the redirect
// target is followed exactly, so access-enforcing redirects behave as before.

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

function FollowRedirect({ redirect, reset }: { redirect: Redirect; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    startTransition(() => {
      if (redirect.type === "replace") router.replace(redirect.url);
      else router.push(redirect.url);
      reset();
    });
  }, [redirect, reset, router]);
  return null;
}

class Boundary extends Component<{ children: ReactNode }, { redirect: Redirect | null }> {
  state: { redirect: Redirect | null } = { redirect: null };

  static getDerivedStateFromError(error: unknown) {
    const redirect = redirectOf(error);
    if (!redirect) throw error;
    return { redirect };
  }

  reset = () => this.setState({ redirect: null });

  render() {
    const { redirect } = this.state;
    // The wrapper is always drawn, `display: contents`, so starting and ending
    // a redirect changes attributes rather than the tree: nothing remounts.
    return (
      <div aria-busy={redirect ? true : undefined} className="action-boundary" inert={redirect ? true : undefined}>
        {redirect ? <FollowRedirect redirect={redirect} reset={this.reset} /> : null}
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
