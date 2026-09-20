"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  createImportedProcessAction,
  previewImportAction,
} from "../actions/import-process";
import { initialImportState } from "../import-state";
import type { ImportedRound } from "../import-spec";
import { roundSubmissionModeLabels, formatRoundDay } from "../round-input";

// The paste-to-build screen.
//
// A Client Component only because of `useActionState`, which is what lets the
// parse result render in place instead of travelling through the query string --
// a parsed process is far too large for a URL, and putting any of it there would
// mean reflecting pasted text back into a page.
//
// It still works with JavaScript switched off. `useActionState` posts the form
// natively in that case and the returned state renders from the server's
// response, which is the same progressive-enhancement path the login form uses.
//
// The prompt sits in a read-only textarea rather than behind a copy button, so
// that it is selectable and copyable with or without scripting. A button that
// silently does nothing for a no-JavaScript admin would be worse than no
// button, and this is one paste a day, not a hot path.

interface ImportScreenProps {
  courseId: number;
  courseTitle: string;
  existingRoundCount: number;
  prompt: string;
}

function RoundCard({ round, index }: { round: ImportedRound; index: number }) {
  const opens = formatRoundDay(round.opensAt);
  const due = formatRoundDay(round.dueAt);

  return (
    <article className="panel">
      <header>
        <h3>
          {index + 1}. {round.name}{" "}
          {round.pending ? <span className="pill">Not live yet</span> : null}
        </h3>
        <p className="muted">
          {roundSubmissionModeLabels[round.submissionMode]}
          {round.fieldCount > 0
            ? ` · ${round.fieldCount} question${round.fieldCount === 1 ? "" : "s"}`
            : ""}
          {round.requiresReview ? " · a mentor reviews it" : " · no mentor review"}
        </p>
        <p className="muted">
          {opens ? `Opens ${opens}` : "No opening date"} ·{" "}
          {due ? `Due ${due}` : "no deadline"}
        </p>
      </header>

      <p>{String(round.config.prompt ?? "")}</p>

      {round.notes.length > 0 ? (
        <ul className="muted">
          {round.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      {round.spec
        ? round.spec.steps.map((step) => (
            <div key={step.key}>
              <h4>{step.title}</h4>
              {step.sections.map((section, sectionIndex) => (
                <div key={`${step.key}-${sectionIndex}`}>
                  {section.title ? <p className="muted">{section.title}</p> : null}
                  <ul>
                    {section.fields.map((field) => (
                      <li key={field.key}>
                        {field.label}{" "}
                        <span className="muted">
                          ({field.type.replace(/_/g, " ")}
                          {field.required ? ", required" : ", optional"}
                          {field.wordLimit ? `, ${field.wordLimit} words` : ""}
                          {field.options ? `, ${field.options.length} options` : ""})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))
        : null}
    </article>
  );
}

export function ImportScreen({
  courseId,
  courseTitle,
  existingRoundCount,
  prompt,
}: ImportScreenProps) {
  const [state, action, pending] = useActionState(previewImportAction, initialImportState);
  const [createState, createAction, creating] = useActionState(
    createImportedProcessAction,
    initialImportState,
  );

  // The confirm step reports through its own state, so its problems are shown
  // beside the preview that produced them rather than replacing it.
  const problems = createState.problems.length > 0 ? createState.problems : state.problems;
  const rounds = state.rounds;

  return (
    <>
      <section className="panel">
        <h2>Build this process from a document</h2>
        <p className="muted">
          For <strong>{courseTitle}</strong>. Copy the prompt below into any AI model
          along with the institution&apos;s admission-process document, then paste its
          answer back here.
        </p>
        <p>
          <Link className="button button--secondary" href={`/admin/courses/${courseId}#rounds`}>
            Back to the programme
          </Link>
        </p>
      </section>

      <section className="panel">
        <h3>Step 1 — copy this prompt</h3>
        <p className="muted">
          Paste it into the model, attach or paste the document underneath it, and send.
        </p>
        <textarea
          aria-label="The prompt to copy"
          className="input"
          readOnly
          rows={10}
          value={prompt}
        />
        <p className="muted">
          Select all of the box above and copy it. The model&apos;s answer will be a
          block of JSON — copy the whole of it, including the curly braces.
        </p>
      </section>

      <form action={action} className="panel stack-form">
        <h3>Step 2 — paste the model&apos;s answer</h3>
        <label className="field">
          <span className="visually-hidden">The model&apos;s answer</span>
          <textarea
            className="input"
            defaultValue={state.pasted || createState.pasted}
            name="pasted"
            placeholder={'{\n  "programme": "…",\n  "rounds": [ … ]\n}'}
            required
            rows={10}
          />
        </label>
        <button className="button" disabled={pending} type="submit">
          {pending ? "Reading…" : "Read this"}
        </button>
      </form>

      {problems.length > 0 ? (
        <section className="panel" role="alert">
          <h3>That could not be used</h3>
          <ul className="form-error">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          <p className="muted">
            Nothing has been changed. Fix the points above — usually by telling the
            model about them and pasting its new answer.
          </p>
        </section>
      ) : null}

      {rounds && rounds.length > 0 ? (
        <>
          <section className="panel">
            <h3>Step 3 — check, then create</h3>
            <p>
              This will create <strong>{rounds.length}</strong> round
              {rounds.length === 1 ? "" : "s"} in <strong>{courseTitle}</strong>.
            </p>
            {existingRoundCount > 0 ? (
              <p className="form-error">
                This programme already has {existingRoundCount} round
                {existingRoundCount === 1 ? "" : "s"}. Importing{" "}
                <strong>removes {existingRoundCount === 1 ? "it" : "them"}</strong> and
                replaces {existingRoundCount === 1 ? "it" : "them"} with what is below.
                If a student has already answered any of them, nothing will be changed
                and you will be told.
              </p>
            ) : null}
            {state.programmeName ? (
              <p className="muted">The document called this “{state.programmeName}”.</p>
            ) : null}
          </section>

          {rounds.map((round, index) => (
            <RoundCard index={index} key={round.name} round={round} />
          ))}

          <form action={createAction} className="panel stack-form">
            <input name="courseId" type="hidden" value={courseId} />
            {/*
              The paste travels again, and the server parses it again. The
              preview above is never the thing that gets written -- it came from
              the browser, and a Server Action is a public endpoint.
            */}
            <input name="pasted" type="hidden" value={state.pasted} />
            <button className="button" disabled={creating} type="submit">
              {creating
                ? "Creating…"
                : existingRoundCount > 0
                  ? `Replace ${existingRoundCount} round${existingRoundCount === 1 ? "" : "s"} with these ${rounds.length}`
                  : `Create these ${rounds.length} round${rounds.length === 1 ? "" : "s"}`}
            </button>
            <p className="muted">
              You can edit every round afterwards, exactly as if you had built it by
              hand.
            </p>
          </form>
        </>
      ) : null}
    </>
  );
}
