import type { Metadata } from "next";

import { RequestLinkForm } from "@/features/auth/components/account-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ResetPasswordPage() {
  return (
    <main className="auth-layout">
      <section className="auth-card" aria-labelledby="reset-title">
        <p className="eyebrow">Cospire LMS</p>
        <h1 id="reset-title">Reset your password</h1>
        <p className="muted">
          Forgotten your password, or your invitation link expired? Enter your
          email and we will send you a link to set a new one.
        </p>
        <RequestLinkForm />
      </section>
    </main>
  );
}
