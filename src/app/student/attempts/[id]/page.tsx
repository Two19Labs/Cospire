import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { parseId } from "@/features/question-bank/list-params";
import { AttemptScreen } from "@/features/test-engine/components/attempt-screen";
import { ResultScreen } from "@/features/test-engine/components/result-screen";
import { getAttemptKeys } from "@/features/test-engine/queries/attempt-keys";
import { getAttemptView } from "@/features/test-engine/queries/attempt-view";

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function StudentAttemptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("student");
  const attemptId = parseId((await params).id);
  if (attemptId === null) notFound();
  // Null for anyone but the attempt's owner: RLS returns it to no one else.
  const view = await getAttemptView(attemptId);
  if (!view) notFound();

  if (view.attempt.status === "submitted") {
    const keys = await getAttemptKeys(view.items.map((item) => item.questionId));
    return <ResultScreen keys={keys} profile={profile} view={view} />;
  }

  const query = await searchParams;
  const q = Number(first(query.q));
  return (
    <AttemptScreen
      auto={first(query.auto) === "1"}
      confirm={first(query.confirm)}
      error={first(query.error)}
      profile={profile}
      q={Number.isSafeInteger(q) && q > 0 ? q : null}
      view={view}
    />
  );
}
