import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { parseId } from "@/features/question-bank/list-params";
import { AttemptScreen } from "@/features/test-engine/components/attempt-screen";
import { ResultScreen } from "@/features/test-engine/components/result-screen";
import { getAttemptKeys } from "@/features/test-engine/queries/attempt-keys";
import { getAttemptView } from "@/features/test-engine/queries/attempt-view";
import { scoreAndStore } from "@/features/test-engine/score-attempt";

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
  let view = await getAttemptView(attemptId);
  if (!view) notFound();

  // Submitted but awaiting a score: closed as the timer's while the student was
  // away, or cleared by a question edit. RLS has just returned the attempt to
  // its owner, which is the check the server-key write relies on.
  if (view.attempt.status === "submitted" && view.attempt.score === null) {
    await scoreAndStore(attemptId);
    view = (await getAttemptView(attemptId)) ?? view;
  }

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
