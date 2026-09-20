import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RoundBuilder } from "@/features/ars/components/round-builder";
import { emptyForm } from "@/features/ars/form-builder";
import { toFormSpec, type RoundMode } from "@/features/ars/form-schema";
import { parseRoundId } from "@/features/ars/list-params";
import { requireRole } from "@/features/auth/guards";
import { parseCourseId } from "@/features/curriculum/list-params";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export const metadata: Metadata = { title: "Build ARS round" };
export default async function AdminArsRoundPage({ params, searchParams }: { params: Promise<{ id: string; roundId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole("admin");
  const values = await params;
  const courseId = parseCourseId(values.id); const roundId = parseRoundId(values.roundId);
  if (courseId === null || roundId === null) notFound();
  const supabase = await createServerSupabaseClient();
  const [roundResult, courseResult] = await Promise.all([
    supabase.from("ars_rounds").select("id, name, submission_mode, config").eq("id", roundId).eq("course_id", courseId).maybeSingle(),
    supabase.from("courses").select("title").eq("id", courseId).maybeSingle(),
  ]);
  if (roundResult.error) throw new Error(`Unable to load the round: ${roundResult.error.message}`);
  if (!roundResult.data) notFound();
  const mode = roundResult.data.submission_mode as RoundMode;
  const error = (await searchParams).error;
  return <RoundBuilder courseId={courseId} courseTitle={courseResult.data?.title ?? "Programme"} error={typeof error === "string" && error.length < 200 ? error : null} mode={mode} profile={profile} roundId={roundId} roundName={roundResult.data.name} spec={toFormSpec(roundResult.data.config, mode) ?? emptyForm} />;
}
