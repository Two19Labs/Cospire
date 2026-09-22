import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The round builder: the round's settings, then its form, field by field.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonPanel lines={1} />
      <SkeletonPanel title={false}>
        <SkeletonForm fields={5} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
