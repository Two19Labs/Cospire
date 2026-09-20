import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The prompt panel and the paste box.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Import a process">
      <SkeletonPanel lines={2} />
      <SkeletonPanel title={false}>
        <SkeletonForm fields={1} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
