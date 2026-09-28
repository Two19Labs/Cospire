import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";

// Two lists: mocks and students, each paged.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Analytics">
      <SkeletonPanel><SkeletonTable columns={4} rows={6} /></SkeletonPanel>
      <SkeletonPanel><SkeletonTable columns={2} rows={6} /></SkeletonPanel>
    </ShellSkeleton>
  );
}
