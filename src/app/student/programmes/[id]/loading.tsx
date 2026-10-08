import {
  ShellSkeleton,
  SkeletonList,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// A programme: no title (it is the programme's name, still loading), the
// progress bar's panel, then a section of items.
export default function Loading() {
  return (
    <ShellSkeleton heading={null} role="student">
      <SkeletonPanel lines={1} />
      <SkeletonPanel>
        <SkeletonList items={4} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
