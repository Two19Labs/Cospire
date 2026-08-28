import { EmptyWorkspace } from "@/features/auth/components/empty-workspace";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

export function MentorHome({ profile }: { profile: Profile }) {
  return (
    <RoleShell profile={profile} title="Mentor workspace">
      <EmptyWorkspace
        description="Assigned students, ARS submissions, and feedback queues will appear here."
        heading="Your mentor workspace is ready"
      />
    </RoleShell>
  );
}
