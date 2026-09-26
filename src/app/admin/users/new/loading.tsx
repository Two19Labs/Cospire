import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// A form beside a short role guide.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Add a user">
      <div className="two-col">
        <SkeletonPanel>
          <SkeletonForm fields={4} />
        </SkeletonPanel>
        <SkeletonPanel lines={3} />
      </div>
    </ShellSkeleton>
  );
}
