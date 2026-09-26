import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The prompt panel and the paste box.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Build from a document">
      <SkeletonPanel lines={4} />
      <SkeletonPanel>
        <SkeletonForm fields={1} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
