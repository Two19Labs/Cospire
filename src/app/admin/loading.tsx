import {
  ShellSkeleton,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The overview: section cards on the left, quick actions and a guide on the
// right. The heading greets the admin by name, so it shimmers until the
// profile arrives.
export default function Loading() {
  return (
    <ShellSkeleton heading={null} role="admin" title="Overview">
      <div className="overview-grid">
        <SkeletonPanel lines={6} />
        <SkeletonPanel lines={4} />
      </div>
    </ShellSkeleton>
  );
}
