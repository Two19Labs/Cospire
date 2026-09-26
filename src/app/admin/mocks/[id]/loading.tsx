import { ShellSkeleton, SkeletonForm, SkeletonLines, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// An existing mock: its title is the heading, so it shimmers. Section links, then the settings form beside its summary.
export default function Loading() {
  return (
    <ShellSkeleton heading={null} role="admin" title="Edit mock">
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
