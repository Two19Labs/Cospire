import { ShellSkeleton, SkeletonLines, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// One mock's instructions and the student's attempts. The title is the mock's
// own name, so the title bar shimmers.
export default function Loading() {
  return (
    <ShellSkeleton role="student">
      <SkeletonPanel>
        <SkeletonLines count={5} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
