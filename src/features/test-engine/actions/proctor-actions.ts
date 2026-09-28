"use server";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { proctorEventTypes } from "../proctor";

// Records one proctoring event: warn and log, never submit (operating manual
// §13.1). Written through the student's own session, so
// `proctor_events_insert_own` decides whose attempt it may land on; the time is
// the database's `now()`, never the browser's. Returns whether it was recorded,
// so the banner can say so truthfully.
export async function recordProctorEvent(attemptId: number, eventType: string): Promise<boolean> {
  await requireRole("student");
  if (!Number.isSafeInteger(attemptId) || attemptId <= 0) return false;
  if (!(proctorEventTypes as readonly string[]).includes(eventType)) return false;

  const supabase = await createServerSupabaseClient();
  // Only while the attempt is being sat: after submitting there is nothing left
  // to proctor, and a stray event would read as a violation on the record.
  const { data: attempt } = await supabase
    .from("attempts")
    .select("status, proctored")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.status !== "in_progress" || !attempt.proctored) return false;

  const { error } = await supabase.from("proctor_events").insert({ attempt_id: attemptId, event_type: eventType });
  return error === null;
}
