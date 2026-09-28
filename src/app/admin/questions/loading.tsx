import { questionBankHeading } from "@/features/question-bank/components/questions-screen";
import { ShellSkeleton, SkeletonPanel, SkeletonTable } from "@/features/auth/components/shell-skeleton";

// The type buttons, then a table of questions.
export default function Loading() {
  return (
    <ShellSkeleton heading={questionBankHeading} role="admin" title="Question bank">
      <SkeletonPanel title={false}>
        <SkeletonTable columns={5} rows={8} />
      </SkeletonPanel>
    </ShellSkeleton>
  );
}
