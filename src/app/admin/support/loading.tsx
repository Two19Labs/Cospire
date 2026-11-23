import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";
import { supportTitle } from "@/features/support/components/inbox-screen";

// A status filter over a paginated table of reports.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title={supportTitle}>
      <SkeletonPanel title={false}>
        <SkeletonTable columns={5} rows={8} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
