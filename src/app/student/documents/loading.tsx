import {
  ShellSkeleton,
  SkeletonPanel,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";

// The documents a student has been granted.
export default function Loading() {
  return (
    <ShellSkeleton role="student" title="Documents">
      <SkeletonPanel title={false}>
        <SkeletonTable columns={3} rows={5} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
