"use client";

import { Button } from "@/shared/ui";

// The workspace's error state: centred, a rust mark, one sentence and one way
// forward. It renders outside the shell, because the shell may be what failed.
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="auth-layout">
      <section className="empty-state state-card">
        <span aria-hidden="true" className="empty-state__mark empty-state__mark--rust">
          !
        </span>
        <p className="eyebrow">Cospire LMS</p>
        <h1>Something went wrong</h1>
        <p>
          The request could not be completed. Try again, or contact an administrator
          if the problem continues.
        </p>
        <Button onClick={reset}>Try again</Button>
      </section>
    </main>
  );
}
