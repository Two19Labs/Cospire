import {
  ShellSkeleton,
  SkeletonPanel,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";
import { usersHeading } from "@/features/admin/components/users-screen";

// A search bar over a paginated table of people.
export default function Loading() {
  return (
    <ShellSkeleton heading={usersHeading} role="admin" title="Users">
      <SkeletonPanel title={false}>
        <SkeletonTable columns={5} rows={6} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
