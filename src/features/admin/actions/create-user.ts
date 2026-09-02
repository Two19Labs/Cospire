"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createAdminSupabaseClient } from "@/shared/db/supabase/admin";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { validateNewUser, type NewUserFieldErrors } from "../user-input";
import type { CreateUserState } from "./create-user-state";

export async function createUserAction(
  _previousState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  // A Server Action is a public HTTP endpoint that anyone holding a session can
  // call directly. The page guard protects the page, not this, so the role is
  // checked again here rather than assumed from how the form was reached.
  const admin = await requireRole("admin");

  const { errors, value } = validateNewUser({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!value) {
    return { error: null, fieldErrors: errors };
  }

  let failure: string | null = null;
  let fieldErrors: NewUserFieldErrors = {};

  try {
    const adminClient = createAdminSupabaseClient();

    // Two systems, no shared transaction: the Auth identity is an API call and
    // the profile is a database write. "Both or neither" is therefore a
    // compensating delete rather than a rollback, and the identity is created
    // first because `profiles_sync_email` reads `auth.users` and refuses a
    // profile whose Auth identity does not yet exist.
    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
        email: value.email,
        password: value.password,
        // Confirmed on creation because no SMTP provider is configured, so
        // nothing could deliver a confirmation link. This is the same route the
        // three Phase 0 test accounts were made by. Once custom SMTP exists,
        // inviting rather than assigning a password becomes the better default.
        email_confirm: true,
      });

    if (createError || !created?.user) {
      const code = createError?.code ?? "";
      const message = createError?.message ?? "";
      const alreadyExists =
        code === "email_exists" || /already|registered|exists/i.test(message);

      if (alreadyExists) {
        fieldErrors = { email: "An account already uses this email address." };
      } else {
        failure = `The account could not be created: ${
          message || "Supabase Auth rejected the request."
        }`;
      }
    } else {
      const userId = created.user.id;

      // Deliberately the signed-in admin's own client, not the secret-key one.
      // The identity above needed the Admin API; this insert does not, and
      // routing it through the session keeps `profiles_insert_admin` in charge
      // of which organisation an admin may write into. Using the secret key
      // here would work and would silently disable that policy.
      const supabase = await createServerSupabaseClient();
      const { error: profileError } = await supabase.from("profiles").insert({
        id: userId,
        org_id: admin.orgId,
        name: value.name,
        role: value.role,
        // NOT NULL, so it must be supplied, but `profiles_sync_email`
        // overwrites it from `auth.users` on every write. The two cannot drift.
        email: value.email,
      });

      if (profileError) {
        const { error: cleanupError } =
          await adminClient.auth.admin.deleteUser(userId);

        if (cleanupError) {
          // Honest reporting beats a tidy message. An Auth identity with no
          // profile is the "orphaned" state the sign-in path already handles,
          // so the user is not stranded silently, but an admin has to remove it
          // from the dashboard and needs to be told that in plain words.
          failure =
            `The profile could not be saved (${profileError.message}), and ` +
            `undoing the sign-in account failed as well (${cleanupError.message}). ` +
            `An account for ${value.email} now exists in Supabase Auth with no ` +
            `profile attached. Delete it in the Supabase dashboard before retrying.`;
        } else {
          failure = `The profile could not be saved: ${profileError.message}`;
        }
      }
    }
  } catch (cause) {
    // Most often the missing secret key. Surfacing it on the form beats the
    // generic error boundary, which hides the cause entirely.
    failure =
      cause instanceof Error
        ? cause.message
        : "The account could not be created.";
  }

  if (failure || Object.keys(fieldErrors).length > 0) {
    return { error: failure, fieldErrors };
  }

  revalidatePath("/admin/users");
  // Outside the try, because redirect() signals success by throwing and
  // catching it would break the navigation.
  redirect("/admin/users");
}
