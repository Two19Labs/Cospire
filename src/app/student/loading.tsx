import { Skeleton, ShellSkeleton, SkeletonList, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// The student's home: the greeting (it carries their name, so it shimmers),
// the courses card, then the reports panel. Same classes as the page, so
// nothing moves when it arrives.
export default function Loading() {
  return (
    <ShellSkeleton heading={null} role="student" title="Home">
      <div aria-hidden="true" className="home-card home-grid__main">
        <Skeleton className="skeleton--small" width="30%" />
        <div className="card-grid card-grid--wide">
          {[0, 1].map((card) => (
            <div className="course-card" key={card}>
              <Skeleton className="skeleton--title skeleton--card-title" width="70%" />
              <Skeleton className="skeleton--small" width="100%" />
              <div className="course-card__bottom">
                <Skeleton className="skeleton--small" width="40%" />
                <Skeleton className="skeleton--small" width="20%" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="skeleton--small" width="40%" />
      </div>
      <SkeletonPanel title={false}>
        <SkeletonList items={1} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
