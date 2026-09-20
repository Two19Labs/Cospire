import {
  ShellSkeleton,
  SkeletonPanel,
  SkeletonTable,
} from "@/features/auth/components/shell-skeleton";

// A programme's own page. No title: it is the programme's name, which is exactly what is still loading.
export default function Loading() {
  return (
    <ShellSkeleton role="admin">
      <SkeletonPanel lines={2} />
      <SkeletonPanel title={false}>
        <SkeletonTable columns={3} rows={4} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
