"use client";

import Link from "next/link";
import { useActionState } from "react";

import { SubmitButton } from "@/shared/ui";

import { importMockDocumentAction, previewMockDocumentAction } from "../actions/mock-document-actions";
import { mockDocumentTemplate } from "../mock-document";
import { initialMockDocumentState, type MockPreview } from "../mock-document-state";
import { questionTypeLabels } from "../question-input";

// A mock written as a document, pasted in and built with no manual picking.
//
// **Nothing here calls a model.** A question ID has to match exactly, so there is
// nothing to interpret and a model would only add the chance of a mistyped ID.
// A document in some other layout is turned into this template with any model
// first, which is the copy-a-prompt habit the Client already has.
//
// Two steps, and the first writes nothing: reading the paste resolves every ID
// against the bank and shows what the mock will be. Confirming re-reads the
// document on the server and ends in the same `save_mock` the builder uses, so
// the result opens in the ordinary mock editor.

function Summary({ preview }: { preview: MockPreview }) {
  return (
    <>
      <p className="muted">
        {preview.durationMinutes} minutes ·{" "}
        {preview.timingMode === "sectional" ? "sectional timers" : "overall timer only"} ·{" "}
        {preview.maxAttempts} {preview.maxAttempts === 1 ? "attempt" : "attempts"} ·{" "}
        {preview.negativeMarking === 0
          ? "no negative marking"
          : `−${preview.negativeMarking} on ${preview.negativeMarkingTypes.join(", ")}`}{" "}
        · {preview.allowMobile ? "phones allowed" : "desktop only"} ·{" "}
        {preview.proctoringEnabled ? "proctored" : "not proctored"}
        {preview.proctoringStated ? "" : " (the document did not say, so it is off)"}
      </p>
      {preview.sections.map((section) => (
        <div key={section.title}>
          <h3 className="field__label">
            {section.title}
            {section.durationMinutes === null ? " · no sectional limit" : ` · ${section.durationMinutes} min`} ·{" "}
            {section.questions.length} {section.questions.length === 1 ? "entry" : "entries"}
          </h3>
          <ul className="report-list">
            {section.questions.map((question) => (
              <li className="report-list__item" key={question.id}>
                <p>
                  <strong>{question.label}</strong>{" "}
                  <span className="muted">
                    {questionTypeLabels[question.type]} · {question.sectionName}
                    {question.type === "di_stimulus"
                      ? ` · DI set, ${question.childCount} ${question.childCount === 1 ? "sub-question" : "sub-questions"} come with it`
                      : ` · ${question.marks} marks`}
                  </span>{" "}
                  {question.excerpt}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export function MockImportScreen() {
  const [state, previewAction] = useActionState(previewMockDocumentAction, initialMockDocumentState);
  const [saveState, saveAction] = useActionState(importMockDocumentAction, initialMockDocumentState);

  // Whichever step last ran and had something to say. A failed confirm shows its
  // own problems over the preview that produced it.
  const problems = saveState.problems.length > 0 ? saveState.problems : state.problems;
  const preview = saveState.problems.length > 0 ? saveState.preview : state.preview;
  const pasted = saveState.pasted || state.pasted;

  return (
    <>
      <p>
        <Link href="/admin/mocks">← Back to mocks</Link>
      </p>

      <section className="panel">
        <h2>Step 1 — write the mock as a document</h2>
        <p className="muted">
          Question IDs come from the bank: every question shows one, such as{" "}
          <code>Q00042</code>, and the bank and each import offer the whole list
          to copy. Write the mock in this shape and paste it below. Nothing here
          calls a model, because an ID has to match exactly.
        </p>
        <textarea
          aria-label="The mock document template"
          className="input input--area input--code"
          readOnly
          rows={14}
          value={mockDocumentTemplate}
        />
        <p className="muted">
          One section with no minutes after it gives the mock an overall timer
          only. Otherwise every section needs its minutes and they must add up to
          the duration. A DI set&apos;s own ID brings its passage and every
          sub-question. <code>Q42</code>, <code>q00042</code> and{" "}
          <code>Q-00042</code> all mean the same question.
        </p>
      </section>

      <form action={previewAction} className="panel stack-form">
        <h2>Step 2 — paste it in</h2>
        <label className="field">
          <span className="field__label">The mock document</span>
          <textarea
            className="input input--area input--code"
            defaultValue={pasted}
            key={pasted.slice(0, 40)}
            name="pasted"
            rows={14}
          />
        </label>
        {problems.length > 0 ? (
          <div className="form-error" role="alert">
            <p>Nothing was created. Fix these and paste it again:</p>
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

      {preview ? (
        <section className="panel stack-form">
          <h2>Step 3 — check it, then build it</h2>
          <p>
            <strong>{preview.title}</strong>
          </p>
          <Summary preview={preview} />
          <p className="muted">
            {preview.questionCount} {preview.questionCount === 1 ? "question" : "questions"} in all, counting the
            sub-questions a DI set brings with it. Nothing has been created yet.
          </p>
          <form action={saveAction}>
            <input name="pasted" type="hidden" value={pasted} />
            <SubmitButton pendingLabel="Building…">Build this mock</SubmitButton>
          </form>
        </section>
      ) : null}
    </>
  );
}
