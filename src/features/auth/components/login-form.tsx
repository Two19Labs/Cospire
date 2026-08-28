"use client";

import { useActionState } from "react";

import { Button, Input } from "@/shared/ui";

import { loginAction } from "../actions/login";
import { initialLoginState } from "../actions/login-state";

export function LoginForm() {
  const [state, action, pending] = useActionState(
    loginAction,
    initialLoginState,
  );

  return (
    <form action={action} className="auth-form">
      <Input
        autoComplete="email"
        label="Email"
        name="email"
        placeholder="you@cospire.in"
        required
        type="email"
      />
      {/*
        No minLength here on purpose. Password rules belong wherever a password is
        set, not where an existing one is checked. Enforcing them at sign-in locks
        out any account whose password predates a policy change, and it leaks the
        policy to anyone viewing the page. Supabase enforces the real rule.
      */}
      <Input
        autoComplete="current-password"
        label="Password"
        name="password"
        required
        type="password"
      />
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button disabled={pending} type="submit">
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
