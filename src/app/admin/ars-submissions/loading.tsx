import { arsSubmissionsHeading, arsSubmissionsTitle } from "@/features/admin/components/ars-submissions-screen";
import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";

// A row of filters over a paginated table of submissions.
export default function Loading() {
  return (
    <ShellSkeleton heading={arsSubmissionsHeading} role="admin" title={arsSubmissionsTitle}>
      <SkeletonPanel title={false}>
        <SkeletonTable columns={5} rows={8} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
