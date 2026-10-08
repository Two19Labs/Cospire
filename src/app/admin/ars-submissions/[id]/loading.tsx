import { ShellSkeleton, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// One submission, read as prose. The heading is the student's name, so it shimmers.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="ARS submission" heading={null}>
      <SkeletonPanel lines={6} />
    </ShellSkeleton>
  );
}
