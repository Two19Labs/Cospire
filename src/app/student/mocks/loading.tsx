import { ShellSkeleton, SkeletonCards } from "@/features/auth/components/shell-skeleton";

// The mocks a student has been granted: a grid of mock cards.
export default function Loading() {
  return (
    <ShellSkeleton role="student" title="Mock tests">
      <SkeletonCards items={3} />
    </ShellSkeleton>
  );
}
