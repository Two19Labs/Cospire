import { ShellSkeleton, SkeletonForm, SkeletonLines, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// The four steps of an import: open a Word file, copy the prompt, paste the
// answer, send it for review. The last panel is the list of earlier imports.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title="Import questions">
      <SkeletonPanel lines={3} />
      <SkeletonPanel lines={8} />
      <SkeletonPanel>
        <SkeletonForm fields={4} />
      </SkeletonPanel>
      <SkeletonPanel>
        <SkeletonLines count={3} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
