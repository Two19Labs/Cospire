import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonPanel,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";
import { documentsHeading } from "@/features/documents/components/documents-screen";

// A filter bar over the library table, then the upload form beside its
// guidance.
export default function Loading() {
  return (
    <ShellSkeleton heading={documentsHeading} role="admin" title="Documents">
      <SkeletonPanel title={false}>
        <SkeletonTable columns={4} rows={6} />
      </SkeletonPanel>
      <div className="two-col">
        <SkeletonPanel>
          <SkeletonForm fields={3} />
        </SkeletonPanel>
        <SkeletonPanel lines={3} />
      </div>
    </ShellSkeleton>
  );
}
