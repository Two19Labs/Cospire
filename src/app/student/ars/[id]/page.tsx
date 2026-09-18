import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { RoundForm } from "@/features/ars/components/round-form";
import { parseRoundId } from "@/features/ars/list-params";
import { getRoundForStudent } from "@/features/ars/queries/student-process";

export const metadata: Metadata = { title: "ARS round" };

function readOne(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.length > 0 && value.length < 40 ? value : null;
}

export default async function StudentRoundPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("student");

  // A URL segment is user input. Anything that is not a positive whole number is
  // a 404 rather than a malformed query sent to Postgres.
  const roundId = parseRoundId((await params).id);
  if (roundId === null) notFound();

  const round = await getRoundForStudent(roundId);
  // RLS filters a round the student's grant does not reach to no row, which is
  // indistinguishable from a deleted one and is meant to be.
  if (!round) notFound();

  const query = await searchParams;
  const rawStep = readOne(query.step);
  const step = rawStep && /^[0-9]{1,3}$/.test(rawStep) ? Number.parseInt(rawStep, 10) - 1 : 0;

  return (
    <RoundForm
      error={readOne(query.error)}
      notice={readOne(query.notice)}
      profile={profile}
      round={round}
      stepIndex={Number.isSafeInteger(step) && step > 0 ? step : 0}
    />
  );
}
