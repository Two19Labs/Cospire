import { ShellSkeleton, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// A reading: its title is the data still loading, then one panel of text.
export default function Loading() {
  return (
    <ShellSkeleton heading={null} role="student">
      <SkeletonPanel lines={8} title={false} />
    </ShellSkeleton>
  );
}
