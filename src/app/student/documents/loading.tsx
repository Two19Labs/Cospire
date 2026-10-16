import { ShellSkeleton, SkeletonCards } from "@/features/auth/components/shell-skeleton";

// The documents a student has been granted: a grid of document cards.
export default function Loading() {
  return (
    <ShellSkeleton role="student" title="Documents">
      <SkeletonCards items={3} />
    </ShellSkeleton>
  );
}
