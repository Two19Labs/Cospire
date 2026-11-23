import type { Metadata } from "next";

import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";

export const metadata: Metadata = { title: "Help" };

// Placeholder: the next slice replaces the body with a ticket form.
export default async function StudentHelpPage() {
  const profile = await requireRole("student");
  return (
    <RoleShell description="Having a technical problem?" profile={profile} title="Help">
      <section className="panel">
        <p className="panel-empty">Raising a ticket from here is coming soon. For now, contact the Cospire team.</p>
      </section>
    </RoleShell>
  );
}
