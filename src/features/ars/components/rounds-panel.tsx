import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/shared/ui";

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
  roundSubmissionModeLabels,
  roundSubmissionModes,
} from "../round-input";

interface RoundsPanelProps {
  courseId: number;
  error: RoundError | null;
  notice: RoundNotice | null;
  rounds: RoundListRow[];
}

export function RoundsPanel({
  courseId,
  error,
  notice,
  rounds,
}: RoundsPanelProps) {
  return (
    <section className="panel" id="rounds">
      <div>
        <h2>ARS rounds</h2>
        <p className="muted">
          {rounds.length === 0
            ? "No rounds yet. Rounds are the steps a student works through for this programme — a mock application, a video essay, a guesstimate, an email."
            : `${rounds.length} round${rounds.length === 1 ? "" : "s"}, in the order students see them.`}
        </p>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {roundErrors[error]}
        </p>
      ) : null}

      {notice ? <p className="muted">{roundNotices[notice]}</p> : null}

      {rounds.length === 0 ? null : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Round</TableHeaderCell>
              <TableHeaderCell>Student submits</TableHeaderCell>
              <TableHeaderCell>Instructions</TableHeaderCell>
              <TableHeaderCell>
                <span className="visually-hidden">Actions</span>
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rounds.map((round) => (
              <TableRow key={round.id}>
                <TableCell>{round.name}</TableCell>
                <TableCell>
                  {roundSubmissionModeLabels[round.submissionMode]}
                  {round.submissionMode === "form" ? (
                    <span className="muted">
                      {" "}
                      ({round.fieldLabels.length} question
                      {round.fieldLabels.length === 1 ? "" : "s"})
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>{round.prompt}</TableCell>
                <TableCell>
                  {/*
                    The Server Action goes straight to the form, so this works
                    with JavaScript disabled. Both ids travel as values and the
                    action rebuilds the destination from a literal path, which is
                    what stops this being an open redirect.
                  */}
                  <form action={deleteRoundAction}>
                    <input name="courseId" type="hidden" value={courseId} />
                    <input name="roundId" type="hidden" value={round.id} />
                    <button
                      className="button button--compact button--danger"
                      type="submit"
                    >
                      Remove
                    </button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <form action={createRoundAction} className="stack-form">
        <h3>Add a round</h3>
        <input name="courseId" type="hidden" value={courseId} />

        <label className="field">
          <span>Name</span>
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
          <legend>What the student submits</legend>
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
        </fieldset>

        <label className="field">
          <span>Instructions to the student</span>
          <textarea
            className="input"
            maxLength={roundPromptMaxLength}
            name="prompt"
            placeholder="What you want them to do, and anything they should know before starting."
            required
            rows={3}
          />
        </label>

        <label className="field">
          <span>Questions, one per line</span>
          <textarea
            className="input"
            name="fields"
            placeholder={"Why this school?\nWhat will you contribute?"}
            rows={3}
          />
          <span className="muted">
            Only used when the round is a set of written answers. Ignored
            otherwise.
          </span>
        </label>

        <button className="button" type="submit">
          Add round
        </button>
      </form>
    </section>
  );
}
