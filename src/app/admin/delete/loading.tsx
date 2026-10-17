import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";

// A fixed title, and one table of pending deletions.
export default function Loading() {
  return (
    <ShellSkeleton heading="Deletions needing attention" role="admin" title="Deletions">
      <SkeletonPanel title={false}>
        <SkeletonTable columns={5} rows={3} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
