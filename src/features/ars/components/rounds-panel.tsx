import Link from "next/link";

import { SubmitButton } from "@/shared/ui";

import { createRoundAction } from "../actions/create-round";
import { deleteRoundAction } from "../actions/delete-round";
import {
  roundErrors,
  roundNotices,
  type RoundError,
  type RoundNotice,
} from "../list-params";
import type { RoundListRow } from "../queries/list-rounds";
import {
  roundNameMaxLength,
  roundPromptMaxLength,
  formatRoundDay,
  roundSubmissionModeLabels,
  roundSubmissionModes,
} from "../round-input";

interface RoundsPanelProps {
  courseId: number;
  error: RoundError | null;
  notice: RoundNotice | null;
  rounds: RoundListRow[];
}

// The short name for each mode, for a round's one-line summary. The long
// labels still explain the choice on the form below.
export const roundModeShortLabels: Record<RoundListRow["submissionMode"], string> = {
  file: "File upload",
  form: "Form",
  offline: "Off-platform",
  text: "Written answer",
};

function roundDates(round: RoundListRow): string {
  const opens = formatRoundDay(round.opensAt);
  const due = formatRoundDay(round.dueAt);
  if (!opens && !due) return "Dates not set";
  return `${opens ?? "Open now"} — ${due ?? "no deadline"}`;
}

export function RoundsPanel({
  courseId,
  error,
  notice,
  rounds,
}: RoundsPanelProps) {
  return (
    <>
      <section className="panel" id="rounds">
        <div className="panel__header">
          <div>
            <h2>Process rounds</h2>
            <p className="muted">
              {rounds.length === 0
                ? "No rounds yet. Rounds are the steps a student works through — a mock application, a video essay, a guesstimate, an email."
                : "In the order students see them."}
            </p>
          </div>
          <span className="tag">
            {rounds.length} round{rounds.length === 1 ? "" : "s"}
          </span>
        </div>

        {error ? (
          <p className="notice notice--error" role="alert">
            {roundErrors[error]}
          </p>
        ) : null}

        {notice ? <p className="notice notice--success">{roundNotices[notice]}</p> : null}

        {rounds.length === 0 ? (
          <p className="panel-empty">
            Add the first round below, or build the whole process from a
            document.
          </p>
        ) : (
          <ol className="round-list">
            {rounds.map((round, index) => (
              <li className="round-row" key={round.id}>
                <span aria-hidden="true" className="round-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="round-row__main">
                  <h3>{round.name}</h3>
                  <p>
                    {roundModeShortLabels[round.submissionMode]}
                    {round.submissionMode === "form"
                      ? ` · ${round.fieldLabels.length} question${round.fieldLabels.length === 1 ? "" : "s"}`
                      : ""}
                    {" · "}
                    {roundDates(round)}
                    {round.requiresReview ? null : " · no mentor review"}
                  </p>
                  {round.prompt ? <p className="round-row__prompt">{round.prompt}</p> : null}
                </div>
                <div className="round-row__actions">
                  {/*
                    The Server Action goes straight to the form, so this works
                    with JavaScript disabled. Both ids travel as values and the
                    action rebuilds the destination from a literal path, which is
                    what stops this being an open redirect.
                  */}
                  <Link
                    className="button button--compact button--secondary"
                    href={`/admin/ars/${courseId}/rounds/${round.id}`}
                  >
                    Edit round
                  </Link>
                  <form action={deleteRoundAction}>
                    <input name="courseId" type="hidden" value={courseId} />
                    <input name="roundId" type="hidden" value={round.id} />
                    <SubmitButton
                      className="button--ghost"
                      compact
                      pendingLabel="Removing…"
                      variant="secondary"
                    >
                      Remove
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel" id="add-round">
        <div className="panel__header">
          <div>
            <h2>Add a round</h2>
            <p className="muted">Choose how a student takes part in this stage.</p>
          </div>
        </div>

        <form action={createRoundAction} className="stack-form stack-form--wide">
          <input name="courseId" type="hidden" value={courseId} />

          <label className="field">
            <span className="field__label">Round name</span>
            <input
              className="input"
              maxLength={roundNameMaxLength}
              name="name"
              placeholder="Mock application"
              required
              type="text"
            />
          </label>

          <fieldset className="field">
            <legend className="field__label">What the student submits</legend>
            <div className="choice-list">
              {roundSubmissionModes.map((mode, index) => (
                <label className="choice" key={mode}>
                  <input
                    defaultChecked={index === 0}
                    name="submissionMode"
                    type="radio"
                    value={mode}
                  />
                  <span>{roundSubmissionModeLabels[mode]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="field">
            <span className="field__label">Instructions to the student</span>
            <textarea
              className="input"
              maxLength={roundPromptMaxLength}
              name="prompt"
              placeholder="What you want them to do, and anything they should know before starting."
              required
              rows={3}
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field__label">Opens on</span>
              <input className="input" name="opensAt" type="date" />
            </label>
            <label className="field">
              <span className="field__label">Due on</span>
              <input className="input" name="dueAt" type="date" />
            </label>
          </div>

          <label className="choice">
            <input defaultChecked name="requiresReview" type="checkbox" />
            <span>A mentor reviews this round</span>
          </label>

          <label className="field">
            <span className="field__label">
              Initial questions, one per line
              <span className="field__optional">Optional</span>
            </span>
            <textarea
              className="input"
              name="fields"
              placeholder={"Why this school?\nWhat will you contribute?"}
              rows={3}
            />
            <span className="field__hint">
              Genuinely optional — leave it empty and build the form properly in{" "}
              <strong>Edit round</strong>, with pages, sections, a type for every
              question and a preview of what the student sees. Anything typed here
              becomes the first page&apos;s questions.
            </span>
          </label>

          <div className="form-end">
            <SubmitButton variant="primary" pendingLabel="Adding…">
              Add round
            </SubmitButton>
          </div>
        </form>
      </section>
    </>
  );
}
