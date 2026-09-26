import type { Metadata } from "next";

import { CreateUserForm } from "@/features/admin/components/create-user-form";
import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";

export const metadata: Metadata = { title: "Add a user" };

export default async function NewUserPage() {
  const profile = await requireRole("admin");

  return (
    <RoleShell
      back={{ href: "/admin/users", label: "Back to users" }}
      description="Create a place for someone on the Cospire platform."
      profile={profile}
      title="Add a user"
    >
      <div className="two-col">
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>Account details</h2>
              <p className="muted">
                The sign-in identity and the profile are created together. If
                either fails, neither is left behind.
              </p>
            </div>
            <span className="tag tag--gold">New account</span>
          </div>
          <CreateUserForm />
        </section>

        <aside className="summary-rail">
          <section className="panel">
            <div className="panel__header">
              <h2>Role guide</h2>
            </div>
            <div>
              <p className="summary-row">
                <span>Student</span>
                <strong>Learning &amp; submissions</strong>
              </p>
              <p className="summary-row">
                <span>Mentor</span>
                <strong>Review &amp; feedback</strong>
              </p>
              <p className="summary-row">
                <span>Admin</span>
                <strong>Platform management</strong>
              </p>
            </div>
            <p className="field__hint">
              Give each person the role appropriate to their work.
            </p>
          </section>
        </aside>
      </div>
    </RoleShell>
  );
}
