import {
  ShellSkeleton,
  SkeletonCards,
  SkeletonList,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The student's home: the greeting (it carries their name, so it shimmers),
// programme cards beside the "Next up" list, then the reports panel.
export default function Loading() {
  return (
    <ShellSkeleton heading={null} role="student" title="Home">
      <div className="home-grid">
        <div className="home-grid__main">
          <SkeletonCards items={2} />
        </div>
        <div className="home-grid__side">
          <SkeletonPanel title={false}>
            <SkeletonList items={2} />
          </SkeletonPanel>
        </div>
      </div>
      <SkeletonPanel title={false}>
        <SkeletonList items={1} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
