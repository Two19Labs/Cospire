import {
  ShellSkeleton,
  SkeletonList,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The student's programme list: one panel of rows.
export default function Loading() {
  return (
    <ShellSkeleton role="student" title="Programmes">
      <SkeletonPanel title={false}>
        <SkeletonList items={3} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
