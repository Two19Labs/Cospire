import {
  ShellSkeleton,
  SkeletonList,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The process and its rounds.
export default function Loading() {
  return (
    <ShellSkeleton role="student" title="Your ARS">
      <SkeletonPanel title={false}>
        <SkeletonList items={3} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
