import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminArsSubmissionDetail } from "@/features/admin/components/ars-submissions-screen";
import { getMentorSubmission, parseSubmissionId } from "@/features/ars-review/queries/mentor-submissions";
import { requireRole } from "@/features/auth/guards";

export const metadata: Metadata = { title: "ARS submission" };

// The mentor's own query, read through the admin's session: RLS returns every
// submission in the admin's organisation, drafts included, and nothing else.
export default async function AdminArsSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole("admin");
  const id = parseSubmissionId((await params).id);
  if (id === null) notFound();
  const submission = await getMentorSubmission(id, { includeDrafts: true });
  if (!submission) notFound();
  return <AdminArsSubmissionDetail profile={profile} submission={submission} />;
}
