import { Button } from "@/shared/ui";

export default function NotFound() {
  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="muted">This page does not exist or is no longer available.</p>
        <form action="/dashboard">
          <Button type="submit">Return to dashboard</Button>
        </form>
      </section>
    </main>
  );
}
