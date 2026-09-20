import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { MentorReviewDetail } from "@/features/ars-review/components/mentor-review-detail";
import { getMentorSubmission, parseSubmissionId } from "@/features/ars-review/queries/mentor-submissions";

export const metadata: Metadata = { title: "Review ARS submission" };

export default async function MentorSubmissionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole("mentor");
  const id = parseSubmissionId((await params).id);
  if (id === null) notFound();
  const submission = await getMentorSubmission(id);
  if (!submission) notFound();
  const query = await searchParams;
  return <MentorReviewDetail profile={profile} submission={submission} notice={typeof query.notice === "string" ? query.notice : undefined} error={typeof query.error === "string" ? query.error : undefined} />;
}
