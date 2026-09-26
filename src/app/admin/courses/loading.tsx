import {
  ShellSkeleton,
  SkeletonCards,
  SkeletonLines,
  SkeletonPanel,
} from "@/features/auth/components/shell-skeleton";
import { programmesHeading } from "@/features/curriculum/components/courses-screen";

// A line of guidance, the programme cards, then the capabilities panel.
export default function Loading() {
  return (
    <ShellSkeleton heading={programmesHeading} role="admin" title="Programmes">
      <SkeletonLines count={1} />
      <SkeletonCards items={3} />
      <SkeletonPanel lines={2} />
    </ShellSkeleton>
  );
}
