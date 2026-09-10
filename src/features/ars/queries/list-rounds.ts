import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import {
  roundSubmissionModes,
  type RoundSubmissionMode,
} from "../round-input";

export interface RoundListRow {
  fieldLabels: string[];
  id: number;
  name: string;
  prompt: string;
  submissionMode: RoundSubmissionMode;
}

// `config` is JSONB, which means the database guarantees it is an object and
// nothing else. Everything read out of it is checked here rather than trusted,
// because a column that can hold any shape will eventually hold an unexpected
// one -- an older row written before a key existed, or a round seeded by hand.
function readConfig(raw: unknown): { fieldLabels: string[]; prompt: string } {
  const config = (raw ?? {}) as Record<string, unknown>;
  const prompt = typeof config.prompt === "string" ? config.prompt : "";

  const fieldLabels: string[] = [];
  if (Array.isArray(config.fields)) {
    for (const entry of config.fields) {
      const label = (entry as Record<string, unknown> | null)?.label;
      if (typeof label === "string" && label !== "") fieldLabels.push(label);
    }
  }

  return { fieldLabels, prompt };
}

function toRow(entry: unknown): RoundListRow {
  const row = entry as Record<string, unknown>;

  if (
    typeof row.id !== "number" ||
    typeof row.name !== "string" ||
    typeof row.submission_mode !== "string"
  ) {
    throw new Error("An ARS round came back in an unexpected shape.");
  }

  if (!(roundSubmissionModes as readonly string[]).includes(row.submission_mode)) {
    // The check constraint makes this unreachable from the database's side. It
    // is caught anyway because the student route switches on this value, and a
    // mode with no renderer must fail here, loudly, rather than as a blank page
    // in front of a student mid-round.
    throw new Error(`Unknown ARS submission mode: ${row.submission_mode}`);
  }

  const { fieldLabels, prompt } = readConfig(row.config);

  return {
    fieldLabels,
    id: row.id,
    name: row.name,
    prompt,
    submissionMode: row.submission_mode as RoundSubmissionMode,
  };
}

// No organisation filter and no role filter, for the same reason `listCourses`
// has none: `ars_rounds_select_authorized` already scopes an admin to their own
// organisation, a student to the programmes they hold, and a mentor to the
// programmes their assigned students hold. Restating that here would be
// application code impersonating the access control, and would mask the
// difference if the policy ever changed.
//
// So this one query will serve the admin's list, the student's and the mentor's
// review queue alike. The rows each sees differ entirely, and the difference is
// the database's decision rather than this function's.
//
// Not paginated, deliberately, and it is the one listing in this codebase that
// is not. A programme's rounds are the four in Annexure A plus whatever an admin
// adds; `ars_rounds_name_unique_per_course` bounds them by name and no screen
// makes sense with a page control. If a programme ever grows enough rounds to
// need paging, that is a product conversation before it is a query change.
export async function listRounds(courseId: number): Promise<RoundListRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("ars_rounds")
    .select("id, name, submission_mode, config")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true })
    // A unique final sort key, so two rounds sharing a sort_order cannot swap
    // places between reads. Matches the (course_id, sort_order, id) index.
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`Unable to list ARS rounds: ${error.message}`);
  }

  return (data ?? []).map(toRow);
}
