import { ShellSkeleton, SkeletonForm, SkeletonLines, SkeletonList, SkeletonPanel } from "@/features/auth/components/shell-skeleton";
import { modulesHeading } from "@/features/modules/components/modules-screen";

// A search bar, the module list, then the add-a-module form.
export default function Loading() {
  return (
    <ShellSkeleton heading={modulesHeading} role="admin" title="Modules">
      <SkeletonLines count={1} />
      <SkeletonPanel>
        <SkeletonList items={5} />
      </SkeletonPanel>
      <SkeletonPanel>
        <SkeletonForm fields={1} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
