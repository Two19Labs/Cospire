import "server-only";

import { headers } from "next/headers";

import { createAdminSupabaseClient } from "@/shared/db/supabase/admin";

import { clientIpFrom } from "./activity-input";

export type ActivityEventType = "active" | "sign_in" | "sign_out";

// The address of the current request, read from the headers on the server.
export async function currentRequestIp(): Promise<string | null> {
  return clientIpFrom((await headers()).get("x-forwarded-for"));
}

// Writes one activity_log row through `public.record_activity`, which only the
// server key may execute: no browser can write, forge or delete a row. The
// caller has already verified who the user is. `active` rows are throttled in
// the database, not here, so nothing is held in server memory.
//
// Never throws. A log that cannot be written must not stop anyone signing in
// or opening a page.
export async function recordActivity(entry: {
  eventType: ActivityEventType;
  ip: string | null;
  sessionId: string | null;
  userId: string;
}): Promise<void> {
  try {
    const admin = createAdminSupabaseClient();
    // `public.record_activity` (20261008120000) is typed by hand only until
    // that migration is applied and `npm run db:types` adds it to the
    // generated types; then call `admin.rpc("record_activity", ...)` directly.
    const call = admin.rpc as unknown as (
      fn: "record_activity",
      args: { p_event_type: ActivityEventType; p_ip: string | null; p_meta: Record<string, string>; p_user_id: string },
    ) => PromiseLike<{ error: { message: string } | null }>;
    await call.call(admin, "record_activity", {
      p_event_type: entry.eventType,
      p_ip: entry.ip,
      p_meta: entry.sessionId ? { session_id: entry.sessionId } : {},
      p_user_id: entry.userId,
    });
  } catch {
    // Deliberately swallowed; see above.
  }
}
