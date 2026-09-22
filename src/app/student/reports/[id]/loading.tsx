import {
  ShellSkeleton,
  SkeletonPanel,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";

// A released report: the overall result, the component table, then the notes.
export default function Loading() {
  return (
    <ShellSkeleton role="student" title="Your ARS report">
      <SkeletonPanel lines={2} />
      <SkeletonPanel title={false}>
        <SkeletonTable columns={3} rows={5} />
      </SkeletonPanel>
      <SkeletonPanel lines={4} />
    </ShellSkeleton>
  );
}
