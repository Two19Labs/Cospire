import {
  ShellSkeleton,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The protected viewer: one page-sized block while the document loads.
export default function Loading() {
  return (
    <ShellSkeleton role="student">
      <SkeletonPanel lines={10} title={false} />
    </ShellSkeleton>
  );
}
