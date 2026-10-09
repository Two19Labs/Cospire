import { activityHeading, activityTitle } from "@/features/admin/components/activity-screen";
import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";

// The flags table over the paginated log of sign-ins.
export default function Loading() {
  return (
    <ShellSkeleton heading={activityHeading} role="admin" title={activityTitle}>
      <SkeletonPanel><SkeletonTable columns={3} rows={2} /></SkeletonPanel>
      <SkeletonPanel><SkeletonTable columns={4} rows={8} /></SkeletonPanel>
    </ShellSkeleton>
  );
}
