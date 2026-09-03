import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

export function StudentHome({ profile }: { profile: Profile }) {
  return (
    <RoleShell profile={profile} title="My learning">
      <section className="panel">
        <div>
          <h2>Your learning platform</h2>
          <p className="muted">
            Courses, tests, progress and mentor feedback appear here as their
            vertical slices are delivered. Documents shared with you are ready
            now.
          </p>
        </div>
        <div className="admin-nav">
          <Link className="button button--primary" href="/student/documents">
            Documents
          </Link>
        </div>
      </section>
    </RoleShell>
  );
}
