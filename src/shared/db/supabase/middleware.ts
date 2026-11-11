import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicSupabaseConfig } from "./config";

// Everything else requires a session. Role checks stay in the page guards, which
// know what role a route wants; this is the floor beneath them, so a route added
// later that forgets `requireRole` is still not readable by an anonymous
// visitor. With several agents adding routes over the build, one forgotten guard
// is a question of when rather than whether.
// `/auth/confirm` is where an invitation or reset email lands, before any session
// exists; it only shows a button (`features/auth/actions/account-link.ts`).
// `/feedback/<code>` is the Client's feedback board (owner, 2026-11-11): no
// login by design, the long random code in the URL is checked by the page and
// by each of its actions (`features/feedback`).
const publicPaths = ["/login", "/auth/no-access", "/auth/confirm", "/feedback"];

function isPublicPath(pathname: string): boolean {
  return publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function updateSupabaseSession(request: NextRequest) {
  const config = getPublicSupabaseConfig();
  // Without configuration nobody can sign in at all, so gating here would only
  // replace the setup notice with a redirect loop.
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, options, value }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getClaims validates the access token rather than trusting cookie contents.
  const { data } = await supabase.auth.getClaims();
  const signedIn = typeof data?.claims?.sub === "string";

  if (!signedIn && !isPublicPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
