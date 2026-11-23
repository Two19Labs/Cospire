import { ShellSkeleton, SkeletonCards } from "@/features/auth/components/shell-skeleton";
import { supportTitle } from "@/features/support/components/inbox-screen";

// The sidebar opens the landing: two option cards (Help tickets, Reported
// mistakes), as the other admin sections' landings are drawn.
export default function Loading() {
  return (
    <ShellSkeleton role="admin" title={supportTitle}>
      <SkeletonCards items={2} />
    </ShellSkeleton>
  );
}
