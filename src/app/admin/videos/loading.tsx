import {
  ShellSkeleton,
  SkeletonForm,
  SkeletonPanel,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";
import { videosHeading } from "@/features/video/components/videos-screen";

// The library table, then the upload form and the add-by-id form.
export default function Loading() {
  return (
    <ShellSkeleton heading={videosHeading} role="admin" title="Videos">
      <SkeletonPanel title={false}>
        <SkeletonTable columns={5} rows={6} />
      </SkeletonPanel>
      <SkeletonPanel>
        <SkeletonForm fields={2} />
      </SkeletonPanel>
      <SkeletonPanel>
        <SkeletonForm fields={2} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
