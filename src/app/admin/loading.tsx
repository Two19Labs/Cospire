import {
  ShellSkeleton,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The fallback for every admin route that has no shape of its own.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Overview">
      <SkeletonPanel lines={3} />
      <SkeletonPanel lines={2} />
    </ShellSkeleton>
  );
}
