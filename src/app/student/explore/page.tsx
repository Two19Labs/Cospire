import type { Metadata } from "next";

import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";

export const metadata: Metadata = { title: "Explore other courses" };

// Placeholder: what this screen does is an open question with the Client (N20).
export default async function StudentExplorePage() {
  const profile = await requireRole("student");
  return (
    <RoleShell description="Other courses will be listed here." profile={profile} title="Explore other courses">
      <section className="panel">
        <p className="panel-empty">Other Cospire courses will be listed here. To join one, contact the Cospire team.</p>
      </section>
    </RoleShell>
  );
}
