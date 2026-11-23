import { Skeleton, ShellSkeleton, SkeletonCards, SkeletonList, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// The student's home: the greeting (it carries their name, so it shimmers),
// the courses card, then the reports panel. Same classes as the page, so
// nothing moves when it arrives.
export default function Loading() {
  return (
    <ShellSkeleton heading={null} role="student" title="Home">
      <div aria-hidden="true" className="home-card home-grid__main">
        <Skeleton className="skeleton--small" width="30%" />
        <SkeletonCards items={2} />
      </div>
      <SkeletonPanel title={false}>
        <SkeletonList items={1} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
