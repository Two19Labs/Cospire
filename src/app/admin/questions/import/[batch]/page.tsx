import type { Metadata } from "next";

import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";
import { ImportReviewRoute } from "@/features/question-bank/components/import-review-route";

export const metadata: Metadata = { title: "Review import" };

export default async function ReviewImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ batch: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const { batch } = await params;
  const query = await searchParams;

  return (
    <RoleShell profile={profile} title="Review import">
      <ImportReviewRoute
        batchId={batch}
        notice={typeof query.notice === "string" ? query.notice : null}
        orgId={profile.orgId}
        page={typeof query.page === "string" ? query.page : undefined}
      />
    </RoleShell>
  );
}
