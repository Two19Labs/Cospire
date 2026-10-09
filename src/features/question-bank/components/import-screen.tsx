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
import { PendingOverlay } from "./pending-overlay";

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

// The paper-wide choices, made once at the last step and applied at staging
// (D20): a document never mixes sections, so its section is chosen once, and a
// paper that grades no questions takes one difficulty for all of them, which
// the review can still change question by question.
function PaperSettings({ defaultMarks, sections }: { defaultMarks: string; sections: Array<{ id: number; name: string }> }) {
  return (
    <div className="form-fields">
      <label className="field">
        <span className="field__label">This paper&apos;s section</span>
        <select className="input" defaultValue="" name="paperSection">
          <option value="">Mixed: read each question&apos;s section from the paper</option>
          {sections.map((section) => (
            <option key={section.id} value={section.name}>
              All questions are {section.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Difficulty, where the paper gives none</span>
        <select className="input" defaultValue="" name="defaultDifficulty">
          <option value="">Leave it to the model, or to me on review</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </label>
      <label className="field">
        <span className="field__label">Marks per correct answer</span>
        <input className="input" defaultValue={defaultMarks} inputMode="decimal" name="defaultMarks" placeholder="e.g. 1" />
        <span className="field__hint">Used where the paper states none. A mock built from it can still set its own.</span>
      </label>
    </div>
  );
}

function StepTrail({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Open the paper", "Get it read", "Check and send for review"];
  return (
    <ol aria-label="Steps" className="tabs">
      {steps.map((label, index) => (
        <li className={`tabs__link${index + 1 === current ? " tabs__link--current" : ""}`} key={label}>
          {`${index + 1} · ${label}`}
        </li>
      ))}
    </ol>
  );
}

export function QuestionImportScreen({
  batches,
  buildMock = false,
  linkRoundId = null,
  modelAvailable,
  modelLabel,
  notice,
  orgId,
  prompt,
  sections,
  startManual = false,
}: {
  batches: ImportBatchSummary[];
  // Opened from Mock tests (D7): the review offers to build a mock from the
  // paper once every question is decided.
  buildMock?: boolean;
  // Opened from an ARS aptitude round (D8): the mock built at the end links
  // itself to this round. Only with `buildMock`.
  linkRoundId?: number | null;
  // Whether the server holds a model key, and what to call the service. No key
  // ever comes near this component -- only whether there is one.
  modelAvailable: boolean;
  modelLabel: string;
  notice: string | null;
  orgId: number;
  prompt: string;
  sections: Array<{ id: number; name: string }>;
  // `?paste=1`: start at step 2 without a Word file. A link rather than a
  // button, so the paste route works with scripting off, like every screen here.
  startManual?: boolean;
}) {
  const [state, previewAction] = useActionState(previewQuestionImportAction, initialQuestionImportState);
  const [geminiState, geminiAction] = useActionState(askGeminiAction, initialQuestionImportState);
  const [stageState, stageAction] = useActionState(stageQuestionImportAction, initialQuestionImportState);
  const [paper, setPaper] = useState<ExtractedPaper | null>(null);
  // "Paste a model's answer without a Word file": the old step 2 for anyone who
  // attaches the paper to a model themselves.
  const manual = startManual;
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
  const step: 1 | 2 | 3 = items ? 3 : paper || manual ? 2 : 1;

  // The prompt and the paste box. Always reachable (D9): when the platform can
  // read the paper itself this sits behind a disclosure, never removed, because
  // the model path can fail and the admin must not be stranded.
  const byHand = (
    <>
      <p className="muted">
        {paper
          ? "Copy the prompt, paste the document's text from step 1 underneath it, send it to any model, then paste the whole answer below."
          : "Copy the prompt into any model, attach or paste the paper underneath it, then paste the whole answer below. Charts come back as a note; paste each picture in on the review screen."}
      </p>
      <textarea aria-label="The prompt to copy" className="input input--code" readOnly rows={8} value={prompt} />
      {paper ? (
        <label className="field">
          <span className="field__label">The document&apos;s text, with figure markers</span>
          <textarea className="input input--area input--code" readOnly rows={8} value={paper.text} />
          {attached > 0 ? (
            <span className="field__hint">Keep the [[figure:N]] markers exactly as they are. Each is matched back to its picture.</span>
          ) : null}
        </label>
      ) : null}
      <form action={previewAction} className="stack-form" onSubmit={() => setSource("paste")}>
        <FigureInputs figurePaths={figurePaths} />
        <input name="documentName" type="hidden" value={paper?.documentName ?? ""} />
        <label className="field">
          <span className="field__label">The model&apos;s answer</span>
          <textarea className="input input--area input--code" defaultValue={active.pasted} key={active.pasted.slice(0, 40)} name="pasted" rows={10} />
        </label>
        <div className="form-actions">
          <SubmitButton pendingLabel="Reading…" variant="secondary">
            Read the answer
          </SubmitButton>
        </div>
      </form>
    </>
  );

  return (
    <>
      <p>
        <Link href={buildMock ? "/admin/mocks" : "/admin/questions"}>{buildMock ? "← Back to mock tests" : "← Back to the question bank"}</Link>
      </p>

      {notice ? <p className="notice notice--success">{notice}</p> : null}
      <StepTrail current={step} />

      {step === 1 ? (
        <section className="panel stack-form">
          <h2>Step 1 — open the paper</h2>
          <p className="muted">
            Choose the paper as a <code>.docx</code>. Its pictures are taken out here and numbered where each one sat.
            {buildMock ? " After review, its questions go into the bank and the mock is built from them." : ""}
          </p>
          <WordUploadField onExtracted={setPaper} orgId={orgId} />
          <p className="muted">
            No Word file?{" "}
            <Link href={`${buildMock ? "/admin/mocks/import-paper" : "/admin/questions/import"}?paste=1${buildMock && linkRoundId ? `&round=${linkRoundId}` : ""}`}>
              Paste a model&apos;s answer instead
            </Link>
          </p>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="panel stack-form">
          <h2>Step 2 — get it read</h2>
          {paper ? (
            <p className="muted">
              {paper.documentName ? <strong>{paper.documentName}. </strong> : null}
              {attached === 0
                ? paper.figureCount === 0
                  ? "No pictures in it."
                  : `${paper.figureCount} figures found, none of which could be taken out.`
                : `${attached === 1 ? "1 picture" : `${attached} pictures`} taken out${paper.figureCount > attached ? `, out of ${paper.figureCount} found` : ""}.`}
            </p>
          ) : null}
          {paper && paper.notes.length > 0 ? (
            <ul className="muted">
              {paper.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}

          {useModel && paper ? (
            <>
              <form action={geminiAction} className="stack-form" onSubmit={() => setSource("gemini")}>
                <p className="muted">
                  The platform sends the text and pictures to {modelLabel} and places each figure itself. This call is billed to
                  the Client&apos;s own Google account.
                </p>
                <input name="documentText" type="hidden" value={paper.text} />
                <input name="documentName" type="hidden" value={paper.documentName} />
                <FigureInputs figurePaths={figurePaths} />
                <div className="form-actions">
                  <SubmitButton pendingLabel="Reading the paper…">{`Read it with ${modelLabel}`}</SubmitButton>
                  <PendingOverlay label={`${modelLabel} is reading the paper…`} detail="This usually takes under a minute. Keep this tab open." />
                </div>
                {usage ? (
                  <p className="muted">
                    Last call: {usage.prompt.toLocaleString()} prompt tokens, {usage.answer.toLocaleString()} answer tokens
                    {usage.thinking > 0 ? `, ${usage.thinking.toLocaleString()} thinking tokens` : ", no thinking tokens"}.
                  </p>
                ) : null}
              </form>
              <details>
                <summary>Or run the prompt yourself</summary>
                {byHand}
              </details>
            </>
          ) : (
            byHand
          )}

          {problems.length > 0 ? (
            <div className="notice notice--error" role="alert">
              <ul>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p>
            <Link href={buildMock ? "/admin/mocks/import-paper" : "/admin/questions/import"}>Start again with another paper</Link>
          </p>
        </section>
      ) : null}

      {step === 3 && items ? (
        <section className="panel stack-form">
          <h2>Step 3 — check, then send for review</h2>
          <p className="muted">
            {items.length} {items.length === 1 ? "question" : "questions"} read
            {withProblems > 0 ? `; ${withProblems} need fixing on the review screen before they can be approved` : ""}. Nothing is
            in the bank yet. Each question is compared with the bank when you send it.
          </p>
          <ol className="report-list">
            {items.map((item) => (
              <ItemSummary item={item} key={item.position} />
            ))}
          </ol>
          <form action={stageAction} className="stack-form">
            <input name="pasted" type="hidden" value={active.pasted} />
            <input name="documentName" type="hidden" value={active.documentName} />
            <input name="buildMock" type="hidden" value={buildMock ? "1" : ""} />
            {buildMock && linkRoundId ? <input name="roundId" type="hidden" value={linkRoundId} /> : null}
            <FigureInputs figurePaths={figurePaths} />
            <PaperSettings defaultMarks={active.defaultMarks} sections={sections} />
            {problems.length > 0 ? (
              <div className="notice notice--error" role="alert">
                <ul>
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="form-actions">
              <SubmitButton pendingLabel="Comparing with the bank…">{`Send ${items.length} for review`}</SubmitButton>
              <PendingOverlay label={`Staging ${items.length} questions for review…`} detail="Each is compared with the bank for duplicates. Keep this tab open." />
            </div>
          </form>
          <p>
            <Link href={buildMock ? "/admin/mocks/import-paper" : "/admin/questions/import"}>Start again</Link>
          </p>
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
                <Link href={`/admin/questions/import/${batch.batchId}`}>{batch.sourceRef ?? "Untitled import"}</Link>{" "}
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
