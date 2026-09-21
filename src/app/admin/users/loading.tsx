import {
  ShellSkeleton,
  SkeletonPanel,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";

// A paginated table of people: four columns, a page of rows.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Users">
      <SkeletonPanel title={false}>
        <SkeletonTable columns={4} rows={6} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
