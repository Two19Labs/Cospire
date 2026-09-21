"use client";

import Link from "next/link";
import { useActionState } from "react";

import { SubmitButton } from "@/shared/ui";

import { previewQuestionImportAction, stageQuestionImportAction } from "../actions/import-actions";
import type { ImportedItem } from "../import-spec";
import { initialQuestionImportState } from "../import-state";
import { questionTypeLabels } from "../question-input";
import type { ImportBatchSummary } from "../queries/list-imports";

// Paste a model's answer and send it for review.
//
// A Client Component only for `useActionState`, so the preview renders in place
// rather than through the URL. It still posts natively with scripting off. The
// prompt sits in a read-only box rather than behind a copy button so it can be
// selected and copied either way -- the ARS importer's reasoning.

function preview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 137)}…` : flat;
}

function ItemSummary({ item }: { item: ImportedItem }) {
  const parsed = item.parsed;
  return (
    <li className="report-list__item">
      <p>
        <strong>{item.position + 1}.</strong>{" "}
        {parsed ? (
          <>
            <span className="muted">
              {questionTypeLabels[parsed.type]}
              {parsed.parentPosition !== null ? ` · part of set ${parsed.parentPosition + 1}` : ""}
              {parsed.sectionName ? ` · ${parsed.sectionName}` : ""}
              {parsed.topic ? ` · ${parsed.topic}` : ""}
            </span>{" "}
            {preview(parsed.body) || <em className="muted">(figure only)</em>}
          </>
        ) : (
          <span className="muted">Could not be read as a question</span>
        )}
      </p>
      {item.problems.length > 0 ? (
        <ul className="field__error">
          {item.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {parsed && parsed.notes.length > 0 ? (
        <ul className="muted">
          {parsed.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function QuestionImportScreen({
  batches,
  notice,
  prompt,
}: {
  batches: ImportBatchSummary[];
  notice: string | null;
  prompt: string;
}) {
  const [state, previewAction] = useActionState(previewQuestionImportAction, initialQuestionImportState);
  const [stageState, stageAction] = useActionState(stageQuestionImportAction, initialQuestionImportState);
  const problems = stageState.problems.length > 0 ? stageState.problems : state.problems;
  const items = state.items;
  const withProblems = items?.filter((item) => item.problems.length > 0).length ?? 0;

  return (
    <>
      <p>
        <Link href="/admin/questions">← Back to the question bank</Link>
      </p>

      {notice ? <p className="muted">{notice}</p> : null}

      <section className="panel">
        <h2>Step 1 — copy this prompt</h2>
        <p className="muted">
          Paste it into Claude or any model, attach or paste the question document
          underneath it, and send. Nothing here calls the model for you.
        </p>
        <textarea aria-label="The prompt to copy" className="input input--code" readOnly rows={10} value={prompt} />
        <p className="muted">
          Charts and pictures in the document come back as a note on the question.
          Paste the image in on the review screen before approving it.
        </p>
      </section>

      <form action={previewAction} className="panel stack-form">
        <h2>Step 2 — paste the answer</h2>
        <div className="form-fields">
          <label className="field">
            <span className="field__label">Document name (optional)</span>
            <input
              className="input"
              defaultValue={state.documentName}
              maxLength={200}
              name="documentName"
              placeholder="e.g. QA practice set 4"
            />
          </label>
          <label className="field">
            <span className="field__label">Default marks (optional)</span>
            <input
              className="input"
              defaultValue={state.defaultMarks}
              inputMode="decimal"
              name="defaultMarks"
              placeholder="e.g. 3"
            />
            <span className="field__hint">Used only where the document does not state marks.</span>
          </label>
        </div>
        <label className="field">
          <span className="field__label">The model&apos;s answer</span>
          <textarea className="input input--area input--code" defaultValue={state.pasted} name="pasted" rows={12} />
        </label>
        {problems.length > 0 ? (
          <div className="form-error" role="alert">
            <ul>
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="form-actions">
          <SubmitButton pendingLabel="Reading…" variant="secondary">
            Read it
          </SubmitButton>
        </div>
      </form>

      {items ? (
        <section className="panel stack-form">
          <h2>Step 3 — send for review</h2>
          <p className="muted">
            {items.length} {items.length === 1 ? "question" : "questions"} read
            {withProblems > 0 ? `; ${withProblems} need fixing on the review screen before they can be approved` : ""}.
            Nothing is in the bank yet: each question is approved one by one.
          </p>
          <ol className="report-list">
            {items.map((item) => (
              <ItemSummary item={item} key={item.position} />
            ))}
          </ol>
          <form action={stageAction}>
            <input name="pasted" type="hidden" value={state.pasted} />
            <input name="documentName" type="hidden" value={state.documentName} />
            <input name="defaultMarks" type="hidden" value={state.defaultMarks} />
            <SubmitButton pendingLabel="Sending…">{`Send ${items.length} for review`}</SubmitButton>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <h2>Imports</h2>
        {batches.length === 0 ? (
          <p className="muted">Nothing imported yet.</p>
        ) : (
          <ul className="report-list">
            {batches.map((batch) => (
              <li className="report-list__item" key={batch.batchId}>
                <Link href={`/admin/questions/import/${batch.batchId}`}>
                  {batch.sourceRef ?? "Untitled import"}
                </Link>{" "}
                <span className="muted">
                  {batch.createdAt.slice(0, 10)} · {batch.pending} to review · {batch.approved} approved
                  {batch.rejected ? ` · ${batch.rejected} rejected` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
