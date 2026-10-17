import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { CleanupsScreen } from "@/features/delete/components/cleanups-screen";
import { listPendingCleanups } from "@/features/delete/queries/delete-preview";

export const metadata: Metadata = { title: "Deletions" };

// Where a delete whose storage or VdoCipher half failed is shown, with a way to
// run that half again.
export default async function AdminDeletionsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const [cleanups, query] = await Promise.all([listPendingCleanups(), searchParams]);
  return (
    <CleanupsScreen
      cleanups={cleanups}
      error={typeof query.error === "string" ? query.error : undefined}
      notice={typeof query.notice === "string" ? query.notice : undefined}
      profile={profile}
    />
  );
}
