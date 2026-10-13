import { Skeleton, ShellSkeleton, SkeletonList, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// The student's home: the greeting (it carries their name, so it shimmers),
// the programmes card beside the "Next up" card, then the reports panel. Same
// classes as the page, so nothing moves when it arrives.
export default function Loading() {
  return (
    <ShellSkeleton heading={null} role="student" title="Home">
      <div aria-hidden="true" className="home-grid">
        <div className="home-card home-grid__main">
          <Skeleton className="skeleton--small" width="30%" />
          <div className="home-rows">
            {[0, 1].map((row) => (
              <div className="home-row" key={row}>
                <div className="home-row__text">
                  <Skeleton className="skeleton--title" width="55%" />
                  <Skeleton className="skeleton--small" width="100%" />
                </div>
                <Skeleton className="skeleton--heading" width="4.5rem" />
              </div>
            ))}
          </div>
        </div>
        <div className="home-card home-grid__side">
          <Skeleton className="skeleton--small" width="30%" />
          <div className="next-list">
            {[0, 1].map((row) => (
              <div className="next-card" key={row}>
                <div className="skeleton-lines">
                  <Skeleton width="60%" />
                  <Skeleton className="skeleton--small" width="80%" />
                </div>
                <Skeleton className="skeleton--button" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <SkeletonPanel title={false}>
        <SkeletonList items={1} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
