import {
  ShellSkeleton,
  SkeletonPanel,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";

// Header, the rounds table, then the students table. Three panels, because this page has three.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonPanel lines={1} />
      <SkeletonPanel title={false}>
        <SkeletonTable columns={5} rows={4} />
      </SkeletonPanel>
      <SkeletonPanel title={false}>
        <SkeletonTable columns={3} rows={3} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
