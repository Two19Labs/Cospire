import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonLines,
  SkeletonList,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// One template: section links, its settings, then its weighted components.
// No title: it is the template's name.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonLines count={1} />
      <SkeletonPanel>
        <SkeletonForm fields={4} />
      </SkeletonPanel>
      <SkeletonPanel>
        <SkeletonList items={4} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
