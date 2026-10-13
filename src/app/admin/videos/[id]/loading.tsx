import { ShellSkeleton, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// A video's preview. No title: it is the video's name. One player-sized block.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonPanel lines={10} title={false} />
    </ShellSkeleton>
  );
}
