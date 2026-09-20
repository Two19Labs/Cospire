import {
  ShellSkeleton,
  SkeletonPanel,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";

// The placeholder cards panel, then the programme table beneath it.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Programmes">
      <SkeletonPanel lines={2} />
      <SkeletonPanel title={false}>
        <SkeletonTable columns={2} rows={5} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
