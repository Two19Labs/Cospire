import {
  ShellSkeleton,
  SkeletonLines,
  SkeletonList,
  SkeletonPanel,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";

// The process's own page. No title: it is the process's name. Section links,
// the rounds beside a summary, then the students table.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonLines count={1} />
      <div className="two-col">
        <SkeletonPanel>
          <SkeletonList items={3} />
        </SkeletonPanel>
        <SkeletonPanel lines={3} />
      </div>
      <SkeletonPanel>
        <SkeletonTable columns={3} rows={3} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
