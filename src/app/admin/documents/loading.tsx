import {
  ShellSkeleton,
  SkeletonPanel,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";

// A table of documents.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Documents">
      <SkeletonPanel title={false}>
        <SkeletonTable columns={4} rows={6} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
