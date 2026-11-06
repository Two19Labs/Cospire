"use server";

import { redirect } from "next/navigation";

import { describePasswordProblem, normalizeEmail } from "@/features/admin/user-input";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import type { AccountFormState } from "./account-link-state";

// The emailed link for an invitation or a password reset. Both templates in
// `supabase/templates/` point at /auth/confirm, which shows a button rather than
// signing in on arrival: mail scanners such as Outlook Safe Links open every
// link in a message, and a GET that spent the one-time token would leave the
// student a dead link before they ever clicked it.
export async function confirmEmailLinkAction(formData: FormData) {
  const tokenHash = formData.get("token_hash");
  const type = formData.get("type");
  let verified = false;

  if (typeof tokenHash === "string" && (type === "invite" || type === "recovery")) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    verified = !error;
  }

  redirect(verified ? "/auth/set-password" : "/login?error=link_expired");
}

export async function setPasswordAction(
  _previousState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const password = formData.get("password");
  const repeat = formData.get("repeat");
  if (typeof password !== "string" || typeof repeat !== "string") {
    return { error: "Enter your new password twice.", sent: false };
  }

  const problem = describePasswordProblem(password);
  if (problem) return { error: problem, sent: false };
  if (password !== repeat) return { error: "The two passwords do not match.", sent: false };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: `Your password could not be saved: ${error.message}`, sent: false };
  }

  redirect("/dashboard");
}

export async function requestPasswordLinkAction(
  _previousState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const raw = formData.get("email");
  const email = typeof raw === "string" ? normalizeEmail(raw) : "";
  if (!email) return { error: "Enter your email address.", sent: false };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  // The same answer whether or not the address has an account, so the form
  // cannot be used to find out who is enrolled. Only a rate limit is worth
  // telling apart, because the person can act on it.
  if (error?.status === 429) {
    return { error: "Too many requests. Wait a few minutes and try again.", sent: false };
  }
  return { error: null, sent: true };
}
