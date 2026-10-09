import { ShellSkeleton, SkeletonCards } from "@/features/auth/components/shell-skeleton";

// The student's programme list: a grid of programme cards with progress.
export default function Loading() {
  return (
    <ShellSkeleton role="student" title="Programmes">
      <SkeletonCards items={2} />
    </ShellSkeleton>
  );
}
