import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { FLAG_WINDOW_HOURS, activityFlags, type ActivityEvent, type ActivityFlag } from "../activity-flags";
import { activityPageSize } from "../activity-params";

// The activity log and its flags, read through the admin's own session:
// `activity_log_select_admin` returns the admin's organisation and nothing
// else, and returns nothing at all to a mentor or a student.
//
// `activity_log` (20261008130000) is not in the generated types until that
// migration is applied and `npm run db:types` runs, so the table is read
// through an untyped view of the same client. Once it is generated, drop the
// cast and the hand-written row checks below can go too.

export interface ActivityRow {
  eventType: ActivityEvent["eventType"];
  id: number;
  ip: string | null;
  occurredAt: string;
  userEmail: string;
  userName: string;
}

export interface NamedFlag { flag: ActivityFlag; userEmail: string; userName: string }

export type ActivityScreenData =
  | { status: "unavailable" }
  | {
      flags: NamedFlag[];
      flagsTruncated: boolean;
      page: number;
      pageCount: number;
      rows: ActivityRow[];
      status: "ready";
      total: number;
    };

// Enough for a hundred people's sign-ins and ten-minute `active` rows across a
// day several times over. Past it the flags are computed on what was read and
// the screen says so.
const flagRowCap = 20_000;
const chunk = 1_000;

function toEvent(raw: Record<string, unknown>): ActivityEvent | null {
  const type = raw.event_type;
  if (type !== "active" && type !== "sign_in" && type !== "sign_out") return null;
  if (typeof raw.user_id !== "string" || typeof raw.occurred_at !== "string") return null;
  const meta = typeof raw.meta === "object" && raw.meta !== null ? raw.meta as Record<string, unknown> : {};
  return {
    eventType: type,
    ip: typeof raw.ip === "string" ? raw.ip : null,
    occurredAt: raw.occurred_at,
    sessionId: typeof meta.session_id === "string" ? meta.session_id : null,
    userId: raw.user_id,
  };
}

// PostgREST's answer when the table does not exist yet.
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

export async function loadActivityScreen(page: number): Promise<ActivityScreenData> {
  const db = (await createServerSupabaseClient()) as unknown as SupabaseClient;
  const from = (page - 1) * activityPageSize;

  // The log itself: sign-ins and sign-outs, newest first. `active` rows feed
  // the flags and are too many to be worth reading one by one.
  const listed = await db
    .from("activity_log")
    .select("id, user_id, event_type, ip, occurred_at", { count: "exact" })
    .in("event_type", ["sign_in", "sign_out"])
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + activityPageSize - 1);
  if (isMissingTable(listed.error)) return { status: "unavailable" };
  if (listed.error) throw new Error(`Unable to read the activity log: ${listed.error.message}`);

  // The flag window, every event type, read in chunks because PostgREST caps
  // one response at a thousand rows.
  const since = new Date(Date.now() - FLAG_WINDOW_HOURS * 3_600_000).toISOString();
  const windowRows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < flagRowCap; offset += chunk) {
    const { data, error } = await db
      .from("activity_log")
      .select("id, user_id, event_type, ip, meta, occurred_at")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + chunk - 1);
    if (error) throw new Error(`Unable to read the activity window: ${error.message}`);
    windowRows.push(...((data ?? []) as Record<string, unknown>[]));
    if ((data ?? []).length < chunk) break;
  }
  const flags = activityFlags(windowRows.map(toEvent).filter((event): event is ActivityEvent => event !== null));

  const listRows = (listed.data ?? []) as Record<string, unknown>[];
  const userIds = [...new Set([...listRows.map((row) => row.user_id), ...flags.map((flag) => flag.userId)])]
    .filter((id): id is string => typeof id === "string");
  const people = new Map<string, { email: string; name: string }>();
  if (userIds.length) {
    const { data, error } = await db.from("profiles").select("id, name, email").in("id", userIds);
    if (error) throw new Error(`Unable to name the activity log: ${error.message}`);
    for (const row of (data ?? []) as { email: string; id: string; name: string }[]) people.set(row.id, row);
  }
  const person = (id: string) => people.get(id) ?? { email: "", name: "Unknown account" };

  const total = listed.count ?? listRows.length;
  return {
    flags: flags.map((flag) => ({ flag, userEmail: person(flag.userId).email, userName: person(flag.userId).name })),
    flagsTruncated: windowRows.length >= flagRowCap,
    page,
    pageCount: Math.max(1, Math.ceil(total / activityPageSize)),
    rows: listRows.flatMap((raw) => {
      const event = toEvent(raw);
      if (!event || typeof raw.id !== "number") return [];
      return [{ eventType: event.eventType, id: raw.id, ip: event.ip, occurredAt: event.occurredAt, userEmail: person(event.userId).email, userName: person(event.userId).name }];
    }),
    status: "ready",
    total,
  };
}
