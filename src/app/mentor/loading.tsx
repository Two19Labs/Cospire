import {
  ShellSkeleton,
  SkeletonList,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The queue of handed-in work.
export default function Loading() {
  return (
    <ShellSkeleton role="mentor" title="Review queue">
      <SkeletonPanel title={false}>
        <SkeletonList items={4} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
