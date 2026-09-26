import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";

// One attempt's breakdown. The title is the mock's name, so it shimmers.
export default function Loading() {
  return (
    <ShellSkeleton role="mentor">
      <SkeletonPanel lines={2} />
      <SkeletonPanel><SkeletonTable columns={7} rows={3} /></SkeletonPanel>
      <SkeletonPanel><SkeletonTable columns={7} rows={5} /></SkeletonPanel>
      <SkeletonPanel><SkeletonTable columns={7} rows={3} /></SkeletonPanel>
    </ShellSkeleton>
  );
}
