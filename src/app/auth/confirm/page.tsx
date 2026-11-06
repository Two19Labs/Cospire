import type { Metadata } from "next";

import { confirmEmailLinkAction } from "@/features/auth/actions/account-link";
import { Button } from "@/shared/ui";

export const metadata: Metadata = { title: "Set up your account" };

// Where an invitation or password-reset email lands. Nothing is spent until the
// button is pressed (see `account-link.ts`).
export default async function ConfirmLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token_hash: tokenHash, type } = await searchParams;
  const invite = type === "invite";

  return (
    <main className="auth-layout">
      <section className="auth-card" aria-labelledby="confirm-title">
        <p className="eyebrow">Cospire LMS</p>
        <h1 id="confirm-title">{invite ? "Welcome to Cospire" : "Reset your password"}</h1>
        <p className="muted">
          {invite
            ? "Your account is ready. Continue to choose the password you will sign in with."
            : "Continue to choose a new password."}
        </p>
        <form action={confirmEmailLinkAction} className="auth-form">
          <input name="token_hash" type="hidden" value={typeof tokenHash === "string" ? tokenHash : ""} />
          <input name="type" type="hidden" value={typeof type === "string" ? type : ""} />
          <Button type="submit">Continue</Button>
        </form>
      </section>
    </main>
  );
}
