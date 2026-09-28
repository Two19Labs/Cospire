import { sectionsHeading } from "@/features/question-bank/components/sections-screen";
import { ShellSkeleton, SkeletonForm, SkeletonPanel } from "@/features/auth/components/shell-skeleton";

// The section rows, then the add form.
export default function Loading() {
  return (
    <ShellSkeleton heading={sectionsHeading} role="admin" title="Question sections">
      <SkeletonPanel lines={4} />
      <SkeletonPanel>
        <SkeletonForm fields={2} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
