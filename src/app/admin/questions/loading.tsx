import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";

// The type buttons, then a table of questions.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Question bank">
      <SkeletonPanel lines={1} />
      <SkeletonPanel title={false}>
        <SkeletonTable columns={6} rows={8} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
