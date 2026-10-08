import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonList,
  SkeletonPanel,
  SkeletonStats,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";

// A programme's own page. No title: it is the programme's name, which is
// exactly what is still loading. Figures, the students table, then the
// curriculum: a section of items and the add-section form.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonStats />
      <SkeletonPanel>
        <SkeletonTable columns={3} rows={4} />
      </SkeletonPanel>
      <SkeletonPanel>
        <SkeletonList items={3} />
      </SkeletonPanel>
      <SkeletonPanel>
        <SkeletonForm fields={1} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
