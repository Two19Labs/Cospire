import "server-only";

import { after } from "next/server";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { proctorEventTypes, type ProctorEventType } from "../proctor";
import { rescoreAwaiting } from "../rescore-awaiting";

export interface MockAttemptRow {
  events: Partial<Record<ProctorEventType, number>>;
  id: number;
  proctored: boolean;
  score: number | null;
  startedAt: string;
  status: "in_progress" | "submitted";
  studentName: string;
  submittedBy: string | null;
}

const attemptLimit = 200;

// Every attempt on one mock, for its admin page, newest first. Read through the
// admin's own session: `attempts_select_admin` and `proctor_events_select_staff`
// decide the organisation, so nothing here filters by it.
export async function listMockAttempts(mockId: number): Promise<MockAttemptRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data: attempts, error } = await supabase
    .from("attempts")
    .select("id, org_id, student_id, proctored, score, started_at, status, submitted_by")
    .eq("mock_id", mockId)
    .order("started_at", { ascending: false })
    .limit(attemptLimit);
  if (error) throw new Error(`Unable to list attempts: ${error.message}`);
  if (!attempts?.length) return [];

  // Attempts awaiting a score (a question edit cleared them) are shown as such
  // and scored after this page has been sent, never inside the render: a key
  // correction can clear hundreds, and the admin must not wait on them
  // (operating manual §8). RLS has just returned them to this admin, in this
  // admin's organisation, which is what the server-key writes rely on.
  const awaiting = attempts.find((row) => row.status === "submitted" && row.score === null);
  if (awaiting) after(() => rescoreAwaiting(awaiting.org_id));

  const ids = attempts.map((row) => row.id);
  const [profiles, events] = await Promise.all([
    supabase.from("profiles").select("id, name").in("id", [...new Set(attempts.map((row) => row.student_id))]),
    supabase.from("proctor_events").select("attempt_id, event_type").in("attempt_id", ids),
  ]);
  if (profiles.error) throw new Error(`Unable to read students: ${profiles.error.message}`);
  if (events.error) throw new Error(`Unable to read proctoring events: ${events.error.message}`);

  const names = new Map((profiles.data ?? []).map((row) => [row.id, row.name]));
  const tally = new Map<number, Partial<Record<ProctorEventType, number>>>();
  for (const event of events.data ?? []) {
    if (!(proctorEventTypes as readonly string[]).includes(event.event_type)) continue;
    const type = event.event_type as ProctorEventType;
    const counts = tally.get(event.attempt_id) ?? {};
    counts[type] = (counts[type] ?? 0) + 1;
    tally.set(event.attempt_id, counts);
  }

  return attempts.map((row) => ({
    events: tally.get(row.id) ?? {},
    id: row.id,
    proctored: row.proctored,
    score: row.score,
    startedAt: row.started_at,
    status: row.status === "submitted" ? "submitted" : "in_progress",
    studentName: names.get(row.student_id) ?? "Unknown student",
    submittedBy: row.submitted_by,
  }));
}
