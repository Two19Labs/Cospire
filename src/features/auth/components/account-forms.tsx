"use client";

import Link from "next/link";
import { useActionState } from "react";

import { passwordMinLength } from "@/features/admin/user-input";
import { Button, Input } from "@/shared/ui";

import { requestPasswordLinkAction, setPasswordAction } from "../actions/account-link";
import { initialAccountFormState } from "../actions/account-link-state";

export function SetPasswordForm() {
  const [state, action, pending] = useActionState(setPasswordAction, initialAccountFormState);

  return (
    <form action={action} className="auth-form">
      <Input
        autoComplete="new-password"
        label="New password"
        minLength={passwordMinLength}
        name="password"
        required
        type="password"
      />
      <Input
        autoComplete="new-password"
        label="Repeat it"
        minLength={passwordMinLength}
        name="repeat"
        required
        type="password"
      />
      <p className="field__hint">
        At least {passwordMinLength} characters, with an uppercase letter, a
        lowercase letter and a digit.
      </p>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button disabled={pending} type="submit">
        {pending ? "Saving..." : "Save password"}
      </Button>
    </form>
  );
}

export function RequestLinkForm() {
  const [state, action, pending] = useActionState(
    requestPasswordLinkAction,
    initialAccountFormState,
  );

  if (state.sent) {
    return (
      <div className="setup-notice" role="status">
        If that address has a Cospire account, an email with a link to set a new
        password is on its way. The link works once, for 24 hours.{" "}
        <Link href="/login">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form action={action} className="auth-form">
      <Input autoComplete="email" label="Email" name="email" required type="email" />
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button disabled={pending} type="submit">
        {pending ? "Sending..." : "Email me a link"}
      </Button>
      <Link className="button button--ghost" href="/login">
        Back to sign in
      </Link>
    </form>
  );
}
