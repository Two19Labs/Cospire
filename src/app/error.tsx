"use client";

import { Button } from "@/shared/ui";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">Cospire LMS</p>
        <h1>Something went wrong</h1>
        <p className="muted">
          The request could not be completed. Try again, or contact an administrator
          if the problem continues.
        </p>
        <Button onClick={reset}>Try again</Button>
      </section>
    </main>
  );
}
