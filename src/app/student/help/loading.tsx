import { ShellSkeleton, SkeletonForm, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// One panel holding the ticket form.
export default function Loading() {
  return (
    <ShellSkeleton role="student" title="Help">
      <SkeletonPanel>
        <SkeletonForm fields={1} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
