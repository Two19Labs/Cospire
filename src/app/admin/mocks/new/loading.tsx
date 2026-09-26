import { ShellSkeleton, SkeletonForm, SkeletonLines, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// The mock builder: section links, then the settings form beside its summary.
export default function Loading() {
  return (
    <ShellSkeleton heading="Build a mock test" role="admin" title="New mock">
      <SkeletonLines count={1} />
      <div className="two-col">
        <SkeletonPanel>
          <SkeletonForm fields={5} />
        </SkeletonPanel>
        <SkeletonPanel lines={6} />
      </div>
    </ShellSkeleton>
  );
}
