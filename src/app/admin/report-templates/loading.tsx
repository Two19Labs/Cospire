import { templatesHeading } from "@/features/ars-report/components/templates-screen";
import {
  ShellSkeleton,
  SkeletonTable,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// The templates table, then the new-template form.
export default function Loading() {
  return (
    <ShellSkeleton heading={templatesHeading} role="admin" title="Report templates">
      <SkeletonPanel>
        <SkeletonTable columns={6} rows={3} />
      </SkeletonPanel>
      <SkeletonPanel lines={2} />
    </ShellSkeleton>
  );
}
