import { SubmitButton } from "@/shared/ui";

import { awardEssayMarkAction } from "../actions/essay-mark-actions";
import { formatMarks } from "../marks";
import { listEssayAnswers } from "../queries/essay-answers";

// The essays in one attempt, for the person marking them.
//
// A server component of its own, so the attempt review screen gains a panel
// and nothing else: it reads only the attempt being looked at, and renders
// nothing at all when the paper carries no essay, which is every mock today.
//
// **It shows what the student wrote and takes a mark.** Who may mark is the
// database's decision -- a mentor who is not this student's mentor sees no
// essays here, because RLS returns none, and the write would be refused as
// well.

const notices: Record<string, string> = {
  failed: "That mark was not saved. You may not be the mentor assigned to this student.",
  invalid: "Give the marks as a number, such as 14 or 13.5.",
  marked: "Marks saved. The attempt's score is being worked out again.",
  toomany: "That is more than this essay is worth on this mock.",
};

export async function EssayMarkingPanel({ attemptId, notice }: { attemptId: number; notice?: string }) {
  const essays = await listEssayAnswers(attemptId);
  if (!essays.length) return null;

  const message = notice ? notices[notice] : undefined;

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>Essays</h2>
          <p className="muted">
            Marked by hand. While an essay is pending, the score above does not include it.
          </p>
        </div>
      </div>
      {message ? <p className="notice">{message}</p> : null}
      {essays.map((essay) => (
        <div key={essay.questionId}>
          <p className="eyebrow">
            {essay.sectionTitle} · out of {formatMarks(essay.maxMarks)} ·{" "}
            {essay.awarded === null ? "pending" : `awarded ${formatMarks(essay.awarded)}`}
          </p>
          <p>
            <strong>{essay.prompt}</strong>
          </p>
          {essay.text === null ? (
            <p className="muted">Not answered, so there is nothing to mark.</p>
          ) : (
            <>
              {/* `question-text` already keeps line breaks as typed. */}
              <p className="question-text">{essay.text}</p>
              <form action={awardEssayMarkAction} className="stack-form">
                <input name="attemptId" type="hidden" value={attemptId} />
                <input name="questionId" type="hidden" value={essay.questionId} />
                <label className="field">
                  <span>Marks out of {formatMarks(essay.maxMarks)}</span>
                  <input
                    defaultValue={essay.awarded === null ? "" : formatMarks(essay.awarded)}
                    inputMode="decimal"
                    name="marks"
                    placeholder="0"
                    required
                  />
                </label>
                <SubmitButton pendingLabel="Saving…">{essay.awarded === null ? "Award marks" : "Change marks"}</SubmitButton>
              </form>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
