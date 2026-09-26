import { mocksHeading } from "@/features/question-bank/components/mocks-screen";
import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";
export default function Loading() { return <ShellSkeleton heading={mocksHeading} role="admin" title="Mock tests"><SkeletonPanel><SkeletonTable columns={6} rows={6} /></SkeletonPanel></ShellSkeleton>; }
