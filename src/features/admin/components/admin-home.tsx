import { EmptyWorkspace } from "@/features/auth/components/empty-workspace";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

export function AdminHome({ profile }: { profile: Profile }) {
  return (
    <RoleShell profile={profile} title="Administration">
      <EmptyWorkspace
        description="Users, access grants, content, and reporting will appear here as their vertical slices are delivered."
        heading="The admin platform is ready"
      />
    </RoleShell>
  );
}
