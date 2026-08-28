import { getPublicSupabaseConfig } from "@/shared/db/supabase/config";

import { LoginForm } from "./login-form";

const notices: Record<string, string> = {
  no_profile:
    "Your sign-in worked, but this account has no active Cospire workspace yet. " +
    "An administrator needs to finish setting it up, or it has been disabled. " +
    "Contact your administrator rather than trying again.",
};

export function LoginScreen({ notice }: { notice?: string }) {
  const configured = Boolean(getPublicSupabaseConfig());
  // Rendered from a fixed table, never from the query string itself, so a
  // crafted link cannot put arbitrary text on the sign-in page.
  const noticeText = notice ? notices[notice] : undefined;

  return (
    <main className="auth-layout">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">Cospire LMS</p>
        <h1 id="login-title">Welcome back</h1>
        <p className="muted">
          Sign in with the account created for you by a Cospire administrator.
        </p>
        {noticeText ? (
          <div className="setup-notice" role="status">
            {noticeText}
          </div>
        ) : null}
        {configured ? (
          <LoginForm />
        ) : (
          <div className="setup-notice" role="status">
            Supabase is not configured yet. Add the public project URL and
            publishable key to <code>.env.local</code> to enable sign-in.
          </div>
        )}
      </section>
    </main>
  );
}
