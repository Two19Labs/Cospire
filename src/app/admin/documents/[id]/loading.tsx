import {
  ShellSkeleton,
  SkeletonPanel,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";

// One document: the page as a student sees it, then who holds access.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonPanel lines={8} />
      <SkeletonPanel title={false}>
        <SkeletonTable columns={3} rows={4} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
