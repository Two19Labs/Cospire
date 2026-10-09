// Pure helpers for the activity log: the caller's address and their Auth
// session id. Kept apart from the `server-only` writer so they can be tested.

import { isIP } from "node:net";

// The client's address, from x-forwarded-for, which Vercel overwrites with the
// address it actually received the connection from -- a browser cannot set it.
// The first entry is the client. Anything that is not an IP address is
// discarded rather than stored, because the column is `inet` and a crafted
// header must not be able to make the insert fail. Never read from a form
// field or a request body.
export function clientIpFrom(forwardedFor: string | null): string | null {
  const first = forwardedFor?.split(",")[0]?.trim() ?? "";
  return first && isIP(first) ? first : null;
}

// The `session_id` claim of a Supabase access token. The token has just been
// issued to the server by Supabase Auth (sign-in) or already verified by
// `getClaims` (everywhere else), so this only reads it.
export function sessionIdFromAccessToken(token: string | null | undefined): string | null {
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    return typeof claims.session_id === "string" ? claims.session_id : null;
  } catch {
    return null;
  }
}
