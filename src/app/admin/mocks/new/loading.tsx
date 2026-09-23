import { ShellSkeleton, SkeletonPanel } from "@/features/auth/components/shell-skeleton";
export default function Loading() { return <ShellSkeleton role="admin" title="New mock"><SkeletonPanel lines={7} /><SkeletonPanel lines={7} /></ShellSkeleton>; }
