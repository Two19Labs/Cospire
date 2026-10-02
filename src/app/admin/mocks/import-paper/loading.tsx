import { ShellSkeleton, SkeletonLines, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// The shape of this screen: the step trail, the one step showing, and the list
// of earlier imports underneath.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Import a paper">
      <SkeletonPanel lines={2} />
      <SkeletonPanel>
        <SkeletonLines count={6} />
      </SkeletonPanel>
      <SkeletonPanel lines={4} />
    </ShellSkeleton>
  );
}
