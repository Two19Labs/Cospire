"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button, Input } from "@/shared/ui";

import { createUserAction } from "../actions/create-user";
import { initialCreateUserState } from "../actions/create-user-state";
import { passwordMinLength } from "../user-input";
import { SelectField } from "./select-field";

const roleOptions = [
  { label: "Student", value: "student" },
  { label: "Mentor", value: "mentor" },
  { label: "Admin", value: "admin" },
] as const;

export function CreateUserForm() {
  const [state, action, pending] = useActionState(
    createUserAction,
    initialCreateUserState,
  );

  return (
    <form action={action} className="auth-form">
      <Input
        autoComplete="off"
        error={state.fieldErrors.name}
        label="Full name"
        name="name"
        required
        type="text"
      />
      <Input
        autoComplete="off"
        error={state.fieldErrors.email}
        label="Email"
        name="email"
        placeholder="student@cospire.in"
        required
        type="email"
      />
      <SelectField
        defaultValue="student"
        error={state.fieldErrors.role}
        label="Role"
        name="role"
        options={roleOptions}
      />
      {/*
        minLength belongs here. Sign-in deliberately has none, because rules
        enforced where a password is *checked* lock out accounts that predate
        them; this is where one is *set*, which is the right place to state the
        rule. It matches the policy pushed to Supabase in config.toml.
      */}
      <Input
        autoComplete="new-password"
        error={state.fieldErrors.password}
        label="Initial password"
        minLength={passwordMinLength}
        name="password"
        required
        type="password"
      />
      <p className="muted">
        At least {passwordMinLength} characters, with an uppercase letter, a
        lowercase letter and a digit. No email is sent, so tell the person their
        password yourself.
      </p>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="form-actions">
        <Button disabled={pending} type="submit">
          {pending ? "Creating..." : "Create user"}
        </Button>
        <Link className="button button--secondary" href="/admin/users">
          Cancel
        </Link>
      </div>
    </form>
  );
}
