import {
  ShellSkeleton,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// One submission, read as prose rather than scanned as a table.
export default function Loading() {
  return (
    <ShellSkeleton role="mentor">
      <SkeletonPanel lines={4} />
      <SkeletonPanel lines={3} />
    </ShellSkeleton>
  );
}
