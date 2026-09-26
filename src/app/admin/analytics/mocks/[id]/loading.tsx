import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";

// One mock: summary, distribution, breakdowns, per question, attempts. The title is the mock's name.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonPanel lines={2} />
      <SkeletonPanel><SkeletonTable columns={2} rows={5} /></SkeletonPanel>
      <SkeletonPanel><SkeletonTable columns={7} rows={3} /></SkeletonPanel>
      <SkeletonPanel><SkeletonTable columns={4} rows={6} /></SkeletonPanel>
    </ShellSkeleton>
  );
}
