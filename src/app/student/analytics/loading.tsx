import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";

// The student's own analytics: a summary, the score trend and the weakest topics.
export default function Loading() {
  return (
    <ShellSkeleton role="student" title="My analytics">
      <SkeletonPanel lines={2} />
      <SkeletonPanel><SkeletonTable columns={6} rows={4} /></SkeletonPanel>
      <SkeletonPanel><SkeletonTable columns={7} rows={5} /></SkeletonPanel>
    </ShellSkeleton>
  );
}
