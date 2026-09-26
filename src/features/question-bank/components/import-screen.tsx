"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { SubmitButton } from "@/shared/ui";

import { askGeminiAction, previewQuestionImportAction, stageQuestionImportAction } from "../actions/import-actions";
import type { ImportedItem } from "../import-spec";
import { initialQuestionImportState } from "../import-state";
import { questionTypeLabels } from "../question-input";
import type { ImportBatchSummary } from "../queries/list-imports";
import { WordUploadField, type ExtractedPaper } from "./word-upload-field";

// Import questions: open a Word file, and then either let the platform read it
// or copy the prompt into a model by hand.
//
// **The platform chooses which, on the owner's design of 2026-09-23.** A paper
// with no pictures is text, and text costs nothing to copy and paste, so that
// path stays as it was. A paper with pictures is where a model earns its fee,
// because the pictures go with the text and the markers place them exactly.
//
// The routing is automatic; the *sending* is one click. An API call spends the
// Client's money, so it is not made because a file was selected.
//
// Whichever path runs, the answer lands in the same box, and staging, review and
// approval are the code that was already there.

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

// The figure map travels on every post that needs it, so each is resolved by the
// same server code. One hidden input per figure, which is what a form can carry
// without inventing an encoding.
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
  modelAvailable,
  modelLabel,
  notice,
  orgId,
  prompt,
}: {
  batches: ImportBatchSummary[];
  // Whether the server holds a model key, and what to call the service. No key
  // ever comes near this component -- only whether there is one.
  modelAvailable: boolean;
  modelLabel: string;
  notice: string | null;
  orgId: number;
  prompt: string;
}) {
  const [state, previewAction] = useActionState(previewQuestionImportAction, initialQuestionImportState);
  const [geminiState, geminiAction] = useActionState(askGeminiAction, initialQuestionImportState);
  const [stageState, stageAction] = useActionState(stageQuestionImportAction, initialQuestionImportState);
  const [paper, setPaper] = useState<ExtractedPaper | null>(null);
  // Which path last ran. Set when the form is submitted, so the two results
  // cannot fight over which one is showing.
  const [source, setSource] = useState<"gemini" | "paste">("paste");

  const active = source === "gemini" ? geminiState : state;
  const items = active.items;
  const problems = stageState.problems.length > 0 ? stageState.problems : active.problems;
  const withProblems = items?.filter((item) => item.problems.length > 0).length ?? 0;

  const figurePaths = paper?.figurePaths ?? {};
  const attached = Object.keys(figurePaths).length;
  const hasPictures = attached > 0;
  const useModel = modelAvailable && hasPictures;
  const usage = geminiState.usage;

  return (
    <>
      <p>
        <Link href="/admin/questions">← Back to the question bank</Link>
      </p>

      {notice ? <p className="muted">{notice}</p> : null}

      <section className="panel stack-form">
        <h2>Step 1 — open the Word file</h2>
        <p className="muted">
          Choose the question paper as a <code>.docx</code>. Its pictures are taken
          out here, into the question bank&apos;s own image store, and the text comes
          back with <code>[[figure:1]]</code>, <code>[[figure:2]]</code> and so on
          where each one sat.
        </p>
        <WordUploadField onExtracted={setPaper} orgId={orgId} />

        {paper ? (
          <>
            <p className="muted">
              {attached === 0
                ? paper.figureCount === 0
                  ? "This document has no pictures in it."
                  : `${paper.figureCount === 1 ? "1 figure" : `${paper.figureCount} figures`} found, none of which could be taken out.`
                : `${attached === 1 ? "1 picture" : `${attached} pictures`} taken out and numbered${
                    paper.figureCount > attached ? `, out of ${paper.figureCount} found` : ""
                  }.`}
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
              <textarea className="input input--area input--code" readOnly rows={12} value={paper.text} />
            </label>
          </>
        ) : null}
      </section>

      {paper ? (
        useModel ? (
          <form
            action={geminiAction}
            className="panel stack-form"
            onSubmit={() => setSource("gemini")}
          >
            <h2>Step 2 — let the platform read it</h2>
            <p className="muted">
              This paper has pictures, so the platform sends the text and the
              pictures to {modelLabel} and places each figure itself. You review
              and approve as usual. Nothing enters the bank without you.
            </p>
            <input name="documentText" type="hidden" value={paper.text} />
            <input name="documentName" type="hidden" value={paper.documentName} />
            <FigureInputs figurePaths={figurePaths} />
            <div className="form-fields">
              <label className="field">
                <span className="field__label">Default marks (optional)</span>
                <input className="input" defaultValue="" inputMode="decimal" name="defaultMarks" placeholder="e.g. 3" />
                <span className="field__hint">Used only where the document does not state marks.</span>
              </label>
            </div>
            <p className="muted">
              This call is billed to the Client&apos;s own Google account. The
              token count is shown once it answers.
            </p>
            <div className="form-actions">
              <SubmitButton pendingLabel="Reading the paper…">{`Read it with ${modelLabel}`}</SubmitButton>
            </div>
            {usage ? (
              <p className="muted">
                Last call: {usage.prompt.toLocaleString()} prompt tokens,{" "}
                {usage.answer.toLocaleString()} answer tokens
                {usage.thinking > 0 ? `, ${usage.thinking.toLocaleString()} thinking tokens` : ", no thinking tokens"}.
              </p>
            ) : null}
          </form>
        ) : (
          <section className="panel">
            <h2>Step 2 — copy this prompt</h2>
            <p className="muted">
              {hasPictures
                ? "This paper has pictures, but no model key is configured on the server, so it has to go through a model by hand."
                : "This paper has no pictures, so there is nothing to pay a model for. Copy the prompt, paste the text from step 1 underneath it, and send."}
            </p>
            <textarea aria-label="The prompt to copy" className="input input--code" readOnly rows={10} value={prompt} />
            {attached > 0 ? (
              <p className="muted">
                Keep the <code>[[figure:N]]</code> markers exactly as they are. Each
                one is matched back to the picture it names.
              </p>
            ) : null}
          </section>
        )
      ) : (
        <section className="panel">
          <h2>Step 2 — copy this prompt</h2>
          <p className="muted">
            Or skip step 1 and attach the document to the model yourself. Paste the
            prompt in, attach or paste the paper underneath it, and send. Nothing
            here calls a model unless you ask it to.
          </p>
          <textarea aria-label="The prompt to copy" className="input input--code" readOnly rows={10} value={prompt} />
          <p className="muted">
            Charts and pictures come back as a note on the question. Paste the
            image in on the review screen before approving it.
          </p>
        </section>
      )}

      <form action={previewAction} className="panel stack-form" onSubmit={() => setSource("paste")}>
        <h2>Step 3 — paste the answer</h2>
        <p className="muted">
          {useModel
            ? `Only needed if you ran the prompt yourself, or if you want to correct what ${modelLabel} returned before sending it for review.`
            : "Paste the model's whole answer here."}
        </p>
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
          <textarea
            className="input input--area input--code"
            defaultValue={active.pasted}
            key={active.pasted.slice(0, 40)}
            name="pasted"
            rows={12}
          />
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
            <input name="pasted" type="hidden" value={active.pasted} />
            <input name="documentName" type="hidden" value={active.documentName} />
            <input name="defaultMarks" type="hidden" value={active.defaultMarks} />
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
