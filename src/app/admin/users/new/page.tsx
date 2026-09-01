import type { Metadata } from "next";

import { CreateUserForm } from "@/features/admin/components/create-user-form";
import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";

export const metadata: Metadata = { title: "Create user" };

export default async function NewUserPage() {
  const profile = await requireRole("admin");

  return (
    <RoleShell profile={profile} title="Create user">
      <section className="panel panel--narrow">
        <h2>New account</h2>
        <p className="muted">
          The sign-in identity and the profile are created together. If either
          fails, neither is left behind.
        </p>
        <CreateUserForm />
      </section>
    </RoleShell>
  );
}
