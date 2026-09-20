import {
  ShellSkeleton,
  SkeletonList,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The student's home.
export default function Loading() {
  return (
    <ShellSkeleton role="student" title="Your work">
      <SkeletonPanel lines={2} />
      <SkeletonPanel title={false}>
        <SkeletonList items={2} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
