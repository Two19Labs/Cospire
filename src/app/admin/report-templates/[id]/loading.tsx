import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonList,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// One template: its settings, then its weighted components.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonPanel title={false}>
        <SkeletonForm fields={4} />
      </SkeletonPanel>
      <SkeletonPanel title={false}>
        <SkeletonList items={4} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
