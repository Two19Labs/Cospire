import { getPublicSupabaseConfig } from "@/shared/db/supabase/config";

import { LoginForm } from "./login-form";

export function LoginScreen() {
  const configured = Boolean(getPublicSupabaseConfig());

  return (
    <main className="auth-layout">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">Cospire LMS</p>
        <h1 id="login-title">Welcome back</h1>
        <p className="muted">
          Sign in with the account created for you by a Cospire administrator.
        </p>
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
