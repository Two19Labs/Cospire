import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

export function AdminHome({ profile }: { profile: Profile }) {
  return (
    <RoleShell profile={profile} title="Administration">
      <section className="panel">
        <div>
          <h2>Manage the platform</h2>
          <p className="muted">
            Content, tests and reporting appear here as their vertical slices
            are delivered.
          </p>
        </div>
        <div className="admin-nav">
          <Link className="button button--primary" href="/admin/users">
            Users
          </Link>
        </div>
      </section>
    </RoleShell>
  );
}
