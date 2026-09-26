import { Button } from "@/shared/ui";

// The workspace's empty state, for an address that leads nowhere.
export default function NotFound() {
  return (
    <main className="auth-layout">
      <section className="empty-state state-card">
        <span aria-hidden="true" className="empty-state__mark">
          ?
        </span>
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p>This page does not exist or is no longer available.</p>
        <form action="/dashboard">
          <Button type="submit">Return to dashboard</Button>
        </form>
      </section>
    </main>
  );
}
