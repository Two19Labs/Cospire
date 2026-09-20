import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { RoundBuilder } from "@/features/ars/components/round-builder";
import { emptyForm } from "@/features/ars/form-builder";
import { toFormSpec, type RoundMode } from "@/features/ars/form-schema";
import { parseRoundId } from "@/features/ars/list-params";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export const metadata: Metadata = { title: "Build round" };

export default async function RoundBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; roundId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const { id, roundId: rawRoundId } = await params;

  // URL segments are user input. Anything that is not a positive whole number is
  // a 404 rather than a malformed query sent to Postgres.
  const courseId = parseRoundId(id);
  const roundId = parseRoundId(rawRoundId);
  if (courseId === null || roundId === null) notFound();

  const supabase = await createServerSupabaseClient();
  const [roundResult, courseResult] = await Promise.all([
    supabase
      .from("ars_rounds")
      .select("id, name, submission_mode, config, course_id")
      .eq("id", roundId)
      .eq("course_id", courseId)
      .maybeSingle(),
    supabase.from("courses").select("title").eq("id", courseId).maybeSingle(),
  ]);

  if (roundResult.error) throw new Error(`Unable to load the round: ${roundResult.error.message}`);
  // RLS filters a round outside this admin's organisation to no row, which is
  // indistinguishable from a deleted one and is meant to be.
  if (!roundResult.data) notFound();

  const mode = roundResult.data.submission_mode as RoundMode;
  const query = await searchParams;
  const rawError = Array.isArray(query.error) ? query.error[0] : query.error;

  return (
    <RoundBuilder
      courseId={courseId}
      courseTitle={courseResult.data?.title ?? "Programme"}
      error={typeof rawError === "string" && rawError.length < 200 ? rawError : null}
      mode={mode}
      profile={profile}
      roundId={roundId}
      roundName={roundResult.data.name}
      spec={toFormSpec(roundResult.data.config, mode) ?? emptyForm}
    />
  );
}
