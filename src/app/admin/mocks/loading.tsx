import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";
export default function Loading() { return <ShellSkeleton role="admin" title="Mock tests"><SkeletonPanel title={false}><SkeletonTable columns={5} rows={6} /></SkeletonPanel></ShellSkeleton>; }
