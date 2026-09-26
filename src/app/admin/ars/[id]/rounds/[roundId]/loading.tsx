import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The round builder: its pages and questions beside the student preview.
// No title: it is the round's name.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <div className="builder">
        <SkeletonPanel>
          <SkeletonForm fields={5} />
        </SkeletonPanel>
        <SkeletonPanel lines={6} />
      </div>
    </ShellSkeleton>
  );
}
