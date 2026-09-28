import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";

// One student's analytics. The title is the student's name, so it shimmers.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonPanel lines={2} />
      <SkeletonPanel><SkeletonTable columns={6} rows={4} /></SkeletonPanel>
      <SkeletonPanel><SkeletonTable columns={7} rows={5} /></SkeletonPanel>
    </ShellSkeleton>
  );
}
