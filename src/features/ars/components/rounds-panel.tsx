import Link from "next/link";

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

      {/*
        The two ways to build a process, side by side. Adding rounds by hand is
        unchanged and remains the default; the importer is for the case this
        screen is slow at -- an institution's whole admission process, written
        down in a document, where typing it in question by question is an
        afternoon.
      */}
      <p>
        <Link
          className="button button--secondary"
          href={`/admin/courses/${courseId}/import`}
        >
          Build from a document instead
        </Link>
      </p>

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
              <TableHeaderCell>Opens</TableHeaderCell>
              <TableHeaderCell>Due</TableHeaderCell>
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
                <TableCell>{formatRoundDay(round.opensAt) ?? "—"}</TableCell>
                <TableCell>{formatRoundDay(round.dueAt) ?? "—"}</TableCell>
                <TableCell>
                  {round.prompt}
                  {round.requiresReview ? null : (
                    <span className="muted"> (no mentor review)</span>
                  )}
                </TableCell>
                <TableCell>
                  {/*
                    The Server Action goes straight to the form, so this works
                    with JavaScript disabled. Both ids travel as values and the
                    action rebuilds the destination from a literal path, which is
                    what stops this being an open redirect.
                  */}
                  <Link
                    className="button button--compact button--secondary"
                    href={`/admin/courses/${courseId}/rounds/${round.id}`}
                  >
                    Edit round
                  </Link>
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

        <div className="field-row">
          <label className="field">
            <span>Opens</span>
            <input className="input" name="opensAt" type="date" />
          </label>
          <label className="field">
            <span>Due</span>
            <input className="input" name="dueAt" type="date" />
          </label>
        </div>

        <label className="choice">
          <input defaultChecked name="requiresReview" type="checkbox" />
          <span>A mentor reviews this round</span>
        </label>

        <label className="field">
          <span>Questions, one per line (optional)</span>
          <textarea
            className="input"
            name="fields"
            placeholder={"Why this school?\nWhat will you contribute?"}
            rows={3}
          />
          <span className="muted">
            Genuinely optional — leave it empty and build the form properly in{" "}
            <strong>Edit round</strong>, with pages, sections, a type for every
            question and a preview of what the student sees. Anything typed here
            becomes the first page&apos;s questions.
          </span>
        </label>

        <button className="button" type="submit">
          Add round
        </button>
      </form>
    </section>
  );
}
