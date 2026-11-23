import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// One upload panel: the file and the two optional course pickers.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Add students from a spreadsheet">
      <SkeletonPanel>
        <SkeletonForm fields={3} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
