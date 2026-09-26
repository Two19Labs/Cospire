import {
  ShellSkeleton,
  SkeletonLines,
  SkeletonPanel,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";

// A document's own page. No title: it is the document's name. Section links,
// the access table, then the preview.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonLines count={1} />
      <SkeletonPanel>
        <SkeletonTable columns={3} rows={4} />
      </SkeletonPanel>
      <SkeletonPanel lines={8} />
    </ShellSkeleton>
  );
}
