import { ShellSkeleton, SkeletonForm, SkeletonList, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// A module's own page. No title: it is the module's name, still loading. The
// rename form, where it is used, the ordered items, then the add-item forms.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonPanel>
        <SkeletonForm fields={1} />
      </SkeletonPanel>
      <SkeletonPanel>
        <SkeletonList items={2} />
      </SkeletonPanel>
      <SkeletonPanel>
        <SkeletonList items={3} />
      </SkeletonPanel>
      <SkeletonPanel>
        <SkeletonForm fields={2} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
