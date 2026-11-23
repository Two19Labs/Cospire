import { ShellSkeleton, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

export default function Loading() {
  return (
    <ShellSkeleton role="student" title="Explore other courses">
      <SkeletonPanel lines={1} title={false} />
    </ShellSkeleton>
  );
}
