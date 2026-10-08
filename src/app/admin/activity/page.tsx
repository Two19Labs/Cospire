import type { Metadata } from "next";

import { ActivityScreen, activityTitle } from "@/features/admin/components/activity-screen";
import { parsePageNumber } from "@/features/admin/list-params";
import { loadActivityScreen } from "@/features/admin/queries/activity-log";
import { requireRole } from "@/features/auth/guards";

export const metadata: Metadata = { title: activityTitle };

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const raw = (await searchParams).page;
  const data = await loadActivityScreen(parsePageNumber(typeof raw === "string" ? raw : undefined));
  return <ActivityScreen data={data} profile={profile} />;
}
