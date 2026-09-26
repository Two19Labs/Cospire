import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The prompt to copy, then the box the answer is pasted into.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Build a report template">
      <SkeletonPanel lines={6} />
      <SkeletonPanel>
        <SkeletonForm fields={1} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
