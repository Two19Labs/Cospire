import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

// Where `requireProfile` sends a user who authenticated successfully but has no
// active profile. The session is ended here rather than in the page guard
// because a Server Component cannot reliably write cookies, so a sign-out
// attempted during a render is silently dropped and the user stays in limbo.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch {
    // The session is being discarded either way. Failing to reach Supabase must
    // not strand the user on an error page instead of the explanation below.
  }

  return NextResponse.redirect(new URL("/login?error=no_profile", request.url));
}
