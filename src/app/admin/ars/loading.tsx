import { arsHeading } from "@/features/ars/components/admin-processes";
import {
  ShellSkeleton,
  SkeletonCards,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";

// Processes are cards, then the add-a-process form.
export default function Loading() {
  return (
    <ShellSkeleton heading={arsHeading} role="admin" title="ARS">
      <SkeletonCards items={3} />
      <SkeletonPanel lines={2} />
    </ShellSkeleton>
  );
}
