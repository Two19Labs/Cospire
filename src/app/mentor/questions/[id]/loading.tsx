import { ShellSkeleton, SkeletonForm, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// The question editor's fields.
export default function Loading() {
  return (
    <ShellSkeleton role="mentor">
      <SkeletonPanel>
        <SkeletonForm fields={6} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
