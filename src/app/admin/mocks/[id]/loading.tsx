import { ShellSkeleton, SkeletonPanel } from "@/features/auth/components/shell-skeleton";
export default function Loading() { return <ShellSkeleton description={false} role="admin" title="Edit mock"><SkeletonPanel lines={7} /><SkeletonPanel lines={7} /></ShellSkeleton>; }
