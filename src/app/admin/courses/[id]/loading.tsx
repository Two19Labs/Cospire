import {
  ShellSkeleton,
  SkeletonPanel,
  SkeletonStats,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";

// A programme's own page. No title: it is the programme's name, which is
// exactly what is still loading. Figures, then the students table.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonStats />
      <SkeletonPanel>
        <SkeletonTable columns={3} rows={4} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
