import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// A round is a form, and its fields are laid out two to a row like the real one.
export default function Loading() {
  return (
    <ShellSkeleton role="student">
      <SkeletonPanel title={false}>
        <SkeletonForm fields={6} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
