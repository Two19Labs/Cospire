"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { SubmitButton } from "@/shared/ui";

import { previewQuestionImportAction, stageQuestionImportAction } from "../actions/import-actions";
import type { ImportedItem } from "../import-spec";
import { initialQuestionImportState } from "../import-state";
import { questionTypeLabels } from "../question-input";
import type { ImportBatchSummary } from "../queries/list-imports";
import { WordUploadField, type ExtractedPaper } from "./word-upload-field";

// Import questions: open a Word file if there is one, copy the prompt and the
// text into a model, paste the answer back, send it for review.
//
// A Client Component for `useActionState`, so the preview renders in place
// rather than through the URL, and for the Word step, which runs in the browser.
// It still posts natively with scripting off; without JavaScript there is no
// Word step and the paste box is the whole flow, as it was before.
//
// The prompt and the extracted text sit in read-only boxes rather than behind a
// copy button so they can be selected and copied either way -- the ARS
// importer's reasoning.

function preview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 137)}…` : flat;
}

function ItemSummary({ item }: { item: ImportedItem }) {
  const parsed = item.parsed;
  const images = parsed?.images ?? [];
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
              {images.length > 0 ? ` · ${images.length === 1 ? "1 figure" : `${images.length} figures`} attached` : ""}
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

// The figure map travels on both posts -- reading a paste and staging it -- so
// each is resolved by the same server code. One hidden input per figure, which
// is what a form can carry without inventing an encoding.
function FigureInputs({ figurePaths }: { figurePaths: Record<number, string> }) {
  return (
    <>
      {Object.entries(figurePaths).map(([n, path]) => (
        <input key={n} name="figures" type="hidden" value={`${n}:${path}`} />
      ))}
    </>
  );
}

export function QuestionImportScreen({
  batches,
  notice,
  orgId,
  prompt,
}: {
  batches: ImportBatchSummary[];
  notice: string | null;
  orgId: number;
  prompt: string;
}) {
  const [state, previewAction] = useActionState(previewQuestionImportAction, initialQuestionImportState);
  const [stageState, stageAction] = useActionState(stageQuestionImportAction, initialQuestionImportState);
  const [paper, setPaper] = useState<ExtractedPaper | null>(null);
  const problems = stageState.problems.length > 0 ? stageState.problems : state.problems;
  const items = state.items;
  const withProblems = items?.filter((item) => item.problems.length > 0).length ?? 0;
  const figurePaths = paper?.figurePaths ?? {};
  const attached = Object.keys(figurePaths).length;

  return (
    <>
      <p>
        <Link href="/admin/questions">← Back to the question bank</Link>
      </p>

      {notice ? <p className="muted">{notice}</p> : null}

      <section className="panel stack-form">
        <h2>Step 1 — open a Word file (optional)</h2>
        <p className="muted">
          Choose the question paper as a <code>.docx</code> and its pictures are
          taken out here, into the question bank&apos;s own image store. The text
          comes back with <code>[[figure:1]]</code>, <code>[[figure:2]]</code> and
          so on where each picture sat, so the model can say which question each
          one belongs to. Nothing is sent to a model from this page.
        </p>
        <WordUploadField onExtracted={setPaper} orgId={orgId} />

        {paper ? (
          <>
            <p className="muted">
              {attached === 0
                ? "No pictures were taken out of this document."
                : `${attached === 1 ? "1 picture" : `${attached} pictures`} taken out and numbered.`}{" "}
              Copy the text below and paste it under the prompt in step 2.
            </p>
            {paper.notes.length > 0 ? (
              <ul className="muted">
                {paper.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
            <label className="field">
              <span className="field__label">The document&apos;s text, with figure markers</span>
              <textarea
                className="input input--area input--code"
                readOnly
                rows={14}
                value={paper.text}
              />
            </label>
          </>
        ) : null}
      </section>

      <section className="panel">
        <h2>Step 2 — copy this prompt</h2>
        <p className="muted">
          Paste it into Claude or any model, then paste the text from step 1
          underneath it — or attach the document itself if you skipped step 1 —
          and send. Nothing here calls the model for you.
        </p>
        <textarea aria-label="The prompt to copy" className="input input--code" readOnly rows={10} value={prompt} />
        <p className="muted">
          {attached > 0
            ? "Keep the [[figure:N]] markers exactly as they are. Each one is matched back to the picture it names when the questions are sent for review."
            : "Charts and pictures in the document come back as a note on the question. Paste the image in on the review screen before approving it."}
        </p>
      </section>

      <form action={previewAction} className="panel stack-form">
        <h2>Step 3 — paste the answer</h2>
        <FigureInputs figurePaths={figurePaths} />
        <div className="form-fields">
          <label className="field">
            <span className="field__label">Document name (optional)</span>
            <input
              className="input"
              defaultValue={state.documentName || paper?.documentName || ""}
              key={paper?.documentName ?? "none"}
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
          <h2>Step 4 — send for review</h2>
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
            <FigureInputs figurePaths={figurePaths} />
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
