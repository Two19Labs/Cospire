"use server";

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import type { LoginState } from "./login-state";

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "Enter your email and password." };
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return { error: "Enter your email and password." };
  }

  // A failure here must surface on the form. Letting it escape the action throws
  // the request to the error boundary, which renders a generic "Something went
  // wrong" and hides the actual cause, most often missing Supabase environment
  // variables. redirect() stays outside the try because it signals success by
  // throwing, and catching that would break the navigation.
  let failure: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      failure = "The email or password is incorrect.";
    }
  } catch {
    failure =
      "Sign-in is unavailable. Check that NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set, then restart the server.";
  }

  if (failure) {
    return { error: failure };
  }

  redirect("/dashboard");
}
