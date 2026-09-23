import { ShellSkeleton, SkeletonForm, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// The prompt and paste boxes, or a question under review.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Review import">
      <SkeletonPanel lines={4} />
      <SkeletonPanel>
        <SkeletonForm fields={4} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
