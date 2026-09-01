import "server-only";

import { createClient } from "@supabase/supabase-js";

import { requirePublicSupabaseConfig } from "./config";

// The secret key bypasses every RLS policy in the database, so this module is
// the single place it is ever read. The `server-only` import above turns a
// mistake here into a build failure rather than a code-review question: import
// this from a Client Component and the build stops.
//
// It exists for exactly one job -- creating and deleting Auth identities, which
// the Auth Admin API offers no other route to. Everything that follows an
// identity being created, starting with the `profiles` row itself, goes through
// the signed-in admin's own client so that RLS, not this application, decides
// what they are allowed to write. Reaching for this client to "just get the
// write done" is how a whole access model quietly stops being enforced.
//
// Operating manual §9.1: server-only, never in a client component, never logged.
export function createAdminSupabaseClient() {
  const { url } = requirePublicSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set. Creating a user needs the Auth Admin API. " +
        "Copy the secret key from Supabase Settings > API Keys into the server " +
        "environment, and never give it a NEXT_PUBLIC_ prefix.",
    );
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
