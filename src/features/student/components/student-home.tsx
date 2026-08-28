import { EmptyWorkspace } from "@/features/auth/components/empty-workspace";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

export function StudentHome({ profile }: { profile: Profile }) {
  return (
    <RoleShell profile={profile} title="My learning">
      <EmptyWorkspace
        description="Courses, documents, tests, progress, and mentor feedback will appear here when access is granted."
        heading="Your learning platform is ready"
      />
    </RoleShell>
  );
}
