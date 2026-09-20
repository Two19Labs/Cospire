import {
  ShellSkeleton,
  SkeletonList,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// Templates are cards.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Report templates">
      <SkeletonPanel title={false}>
        <SkeletonList items={3} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
