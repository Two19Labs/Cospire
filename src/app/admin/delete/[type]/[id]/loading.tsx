import { ShellSkeleton, SkeletonLines, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// No title: the heading is the record's name, so the title bar shimmers too.
// One panel, shaped like the screen: the list of what will be removed, then the
// field the name is typed into.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonPanel>
        <SkeletonLines count={5} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
