import { ShellSkeleton, SkeletonLines, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// A question and its palette, or a result. The title is the mock's name.
export default function Loading() {
  return (
    <ShellSkeleton role="student">
      <SkeletonPanel>
        <SkeletonLines count={6} />
      </SkeletonPanel>
      <SkeletonPanel title={false}>
        <SkeletonLines count={2} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
