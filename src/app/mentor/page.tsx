import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { MentorReports } from "@/features/ars-report/components/mentor-reports";
import { parsePage } from "@/features/ars-report/list-params";
import { listMentorReports } from "@/features/ars-report/queries/list-reports";
import { MentorReviewQueue, OfflineRoundQueue } from "@/features/ars-review/components/mentor-review-queue";
import { listMentorSubmissions, listOfflineRoundsToRecord } from "@/features/ars-review/queries/mentor-submissions";
import { RoleShell } from "@/features/auth/components/role-shell";

export const metadata: Metadata = { title: "Mentor workspace" };

export default async function MentorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("mentor");
  const query = await searchParams;
  const page = parsePage(query.page);
  const [reports, submissions, offlineRounds] = await Promise.all([listMentorReports({ page }), listMentorSubmissions(), listOfflineRoundsToRecord()]);
  return (
    <RoleShell profile={profile} title="Mentor workspace">
      {query.notice === "offline-recorded" ? <p className="notice notice--success">Off-platform outcome recorded.</p> : null}
      {typeof query.error === "string" ? <p className="notice notice--error">{query.error === "earlier-round-first" ? "Finish the student’s earlier round before recording this outcome." : "That outcome could not be saved."}</p> : null}
      <MentorReviewQueue rows={submissions} />
      <OfflineRoundQueue rows={offlineRounds} />
      <MentorReports profile={profile} reports={reports} embedded />
    </RoleShell>
  );
}
