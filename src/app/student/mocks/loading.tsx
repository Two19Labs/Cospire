import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";

// The mocks a student has been granted.
export default function Loading() {
  return (
    <ShellSkeleton role="student" title="Mock tests">
      <SkeletonPanel>
        <SkeletonTable columns={4} rows={4} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
