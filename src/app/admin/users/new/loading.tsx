import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// A single form, not a list.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Add a user">
      <SkeletonPanel title={false}>
        <SkeletonForm fields={4} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
