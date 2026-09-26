import { ShellSkeleton, SkeletonLines, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// Three panels, in the shape of this screen: the template to copy, the box the
// document is pasted into, and the preview that only appears once it reads.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Build a mock from a document">
      <SkeletonPanel lines={10} />
      <SkeletonPanel>
        <SkeletonLines count={8} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
