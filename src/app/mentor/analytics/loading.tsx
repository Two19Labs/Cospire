import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";

// The assigned students' submitted mocks, paged.
export default function Loading() {
  return (
    <ShellSkeleton role="mentor" title="Student results">
      <SkeletonPanel><SkeletonTable columns={6} rows={6} /></SkeletonPanel>
    </ShellSkeleton>
  );
}
