import { ShellSkeleton, SkeletonForm, SkeletonLines, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// The question editor's fields.
export default function Loading() {
  return (
    <ShellSkeleton heading="Create a question" role="admin" title="New question">
      <SkeletonLines count={1} />
      <SkeletonPanel>
        <SkeletonForm fields={6} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
