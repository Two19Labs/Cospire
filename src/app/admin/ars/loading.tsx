import {
  ShellSkeleton,
  SkeletonList,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// Processes are cards with a button on the right, not table rows.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="ARS">
      <SkeletonPanel title={false}>
        <SkeletonList items={3} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
