"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { parseRoundId } from "../list-params";
import { parseMockIdField, withRoundMock } from "../round-mock";

// Links an off-platform round to a mock test, or unlinks it.
//
// Written through the admin's own client, so `ars_rounds_update_admin` decides
// who may write the round and the mocks policy decides which mock exists for
// this admin. A mock id the admin cannot read is refused rather than stored:
// a link to another organisation's mock would show every student "not opened".
function builderHref(courseId: number, roundId: number, query: string): string {
  return `/admin/ars/${courseId}/rounds/${roundId}?${query}`;
}

export async function setRoundMockAction(formData: FormData): Promise<void> {
  await requireRole("admin");

  const read = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === "string" ? raw.slice(0, 20) : "";
  };
  const courseId = parseRoundId(read("courseId"));
  const roundId = parseRoundId(read("roundId"));
  if (courseId === null || roundId === null) redirect("/admin/ars");

  const field = parseMockIdField(formData.get("mockId"));
  if (!field.ok) redirect(builderHref(courseId, roundId, "error=That+is+not+a+mock+test."));

  const supabase = await createServerSupabaseClient();
  const { data: round, error: readError } = await supabase
    .from("ars_rounds")
    .select("id, course_id, submission_mode, config")
    .eq("id", roundId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (readError || !round) redirect(builderHref(courseId, roundId, "error=That+round+no+longer+exists."));

  // Only an off-platform round is a test sat elsewhere; a form or upload round
  // has an answer of its own, and a mock beside it would be two answers.
  if (round.submission_mode !== "offline") {
    redirect(builderHref(courseId, roundId, "error=Only+an+off-platform+round+can+be+linked+to+a+mock+test."));
  }

  if (field.mockId !== null) {
    const { data: mock, error: mockError } = await supabase
      .from("mocks")
      .select("id")
      .eq("id", field.mockId)
      .maybeSingle();
    if (mockError || !mock) redirect(builderHref(courseId, roundId, "error=That+mock+test+was+not+found."));
  }

  const { data, error } = await supabase
    .from("ars_rounds")
    .update({ config: withRoundMock(round.config, field.mockId) })
    .eq("id", roundId)
    .select("id");

  // Row count, not the absence of an error: RLS filters a disallowed update to
  // zero rows and PostgREST reports success.
  if (error || (data ?? []).length !== 1) {
    redirect(builderHref(courseId, roundId, "error=That+change+could+not+be+saved."));
  }

  revalidatePath(`/admin/ars/${courseId}/rounds/${roundId}`);
  revalidatePath("/student/ars");
  redirect(builderHref(courseId, roundId, field.mockId === null ? "notice=mock-unlinked" : "notice=mock-linked"));
}
