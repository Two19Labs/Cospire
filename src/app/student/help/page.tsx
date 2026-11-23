import type { Metadata } from "next";
import { headers } from "next/headers";

import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";
import { ReportForm } from "@/features/support/components/report-form";
import { normalisePage } from "@/features/support/support";

export const metadata: Metadata = { title: "Help" };

// A help ticket for a technical problem (D65). The page the student came from
// rides along, so the team can see where it went wrong.
export default async function StudentHelpPage() {
  const profile = await requireRole("student");
  const referer = (await headers()).get("referer");
  const page = referer ? normalisePage(referer) : "/student/help";
  return (
    <RoleShell description="Having a technical problem? Tell the Cospire team here." profile={profile} title="Help">
      <section className="panel">
        <h2>Raise a ticket</h2>
        <ReportForm kind="ticket" page={page} />
      </section>
    </RoleShell>
  );
}
