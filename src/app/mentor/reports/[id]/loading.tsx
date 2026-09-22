import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The report editor: the weighted summary, then a component's scores and notes.
export default function Loading() {
  return (
    <ShellSkeleton role="mentor">
      <SkeletonPanel lines={2} />
      <SkeletonPanel title={false}>
        <SkeletonForm fields={5} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
