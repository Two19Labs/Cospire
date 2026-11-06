import type { Metadata } from "next";

import { SetPasswordForm } from "@/features/auth/components/account-forms";
import { requireProfile } from "@/features/auth/guards";

export const metadata: Metadata = { title: "Choose a password" };

// Reached signed in, from the emailed link (`/auth/confirm`).
export default async function SetPasswordPage() {
  const profile = await requireProfile();

  return (
    <main className="auth-layout">
      <section className="auth-card" aria-labelledby="set-password-title">
        <p className="eyebrow">Cospire LMS</p>
        <h1 id="set-password-title">Choose a password</h1>
        <p className="muted">
          For {profile.email}. You will sign in with this from now on.
        </p>
        <SetPasswordForm />
      </section>
    </main>
  );
}
