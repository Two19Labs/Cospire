import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

import {
  addFieldAction,
  addPageAction,
  addSectionAction,
  moveFieldAction,
  removeFieldAction,
  removePageAction,
  removeSectionAction,
  renamePageAction,
  renameSectionAction,
  setPageSubtitleAction,
} from "../actions/builder-actions";
import { countFields, readyForStudents } from "../form-builder";
import { fieldsForStep, type FormField, type FormSpec, type RoundMode } from "../form-schema";
import { RoundPreview } from "./round-preview";

// The round builder: an admin composes the form a student will answer, without
// a developer. Annexure A promises admins can add round types over time, and the
// founder asked for "an ARS builder where we can just place those specific
// things". This is that.
//
// Reordering is up and down buttons rather than drag-and-drop, deliberately.
// Everything in this console works with JavaScript disabled -- that is how it
// has been built and verified throughout -- and drag would break it.

const typeLabels: Record<string, string> = {
  checkbox: "Checkbox",
  date: "Date",
  file: "File upload",
  long_text: "Long answer",
  month_year: "Month and year",
  number: "Number",
  radio: "Multiple choice",
  score_list: "Score list (exam + score)",
  select: "Dropdown",
  short_text: "Short text",
  single_choice: "Single choice",
};

function FieldRow({
  courseId,
  field,
  roundId,
}: {
  courseId: number;
  field: FormField;
  roundId: number;
}) {
  const detail = [
    typeLabels[field.type] ?? field.type,
    field.required ? "required" : "optional",
    field.options?.length ? `${field.options.length} options` : null,
    field.wordLimit ? `${field.wordLimit} words` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="field-row">
      <div>
        <strong>{field.label}</strong>
        <p className="muted">{detail}</p>
      </div>
      <div className="admin-nav">
        {(["up", "down"] as const).map((direction) => (
          <form action={moveFieldAction} key={direction}>
            <input name="courseId" type="hidden" value={courseId} />
            <input name="roundId" type="hidden" value={roundId} />
            <input name="fieldKey" type="hidden" value={field.key} />
            <input name="direction" type="hidden" value={direction} />
            <button className="button button--secondary" type="submit">
              {direction === "up" ? "↑" : "↓"}
            </button>
          </form>
        ))}
        <form action={removeFieldAction}>
          <input name="courseId" type="hidden" value={courseId} />
          <input name="roundId" type="hidden" value={roundId} />
          <input name="fieldKey" type="hidden" value={field.key} />
          <button className="button button--secondary" type="submit">Remove</button>
        </form>
      </div>
    </div>
  );
}

function AddField({
  courseId,
  roundId,
  sectionIndex,
  stepKey,
}: {
  courseId: number;
  roundId: number;
  sectionIndex: number;
  stepKey: string;
}) {
  return (
    <details>
      <summary>Add a question</summary>
      <form action={addFieldAction} className="stack-form">
        <input name="courseId" type="hidden" value={courseId} />
        <input name="roundId" type="hidden" value={roundId} />
        <input name="stepKey" type="hidden" value={stepKey} />
        <input name="sectionIndex" type="hidden" value={sectionIndex} />

        <label htmlFor={`label-${stepKey}-${sectionIndex}`}>Question</label>
        <input
          id={`label-${stepKey}-${sectionIndex}`}
          maxLength={200}
          name="label"
          placeholder="Full Name"
          required
          type="text"
        />

        <label htmlFor={`type-${stepKey}-${sectionIndex}`}>Type</label>
        <select defaultValue="short_text" id={`type-${stepKey}-${sectionIndex}`} name="type">
          {Object.entries(typeLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <label className="choice" htmlFor={`required-${stepKey}-${sectionIndex}`}>
          <input defaultChecked id={`required-${stepKey}-${sectionIndex}`} name="required" type="checkbox" />
          <span>Required</span>
        </label>

        <label htmlFor={`options-${stepKey}-${sectionIndex}`}>
          Options — one per line, for dropdown, multiple choice and score list
        </label>
        <textarea
          id={`options-${stepKey}-${sectionIndex}`}
          name="options"
          placeholder={"Male\nFemale\nOther"}
          rows={3}
        />

        <label htmlFor={`wordLimit-${stepKey}-${sectionIndex}`}>Word limit — long answers only</label>
        <input
          id={`wordLimit-${stepKey}-${sectionIndex}`}
          inputMode="numeric"
          name="wordLimit"
          placeholder="200"
          type="text"
        />

        <label htmlFor={`helpText-${stepKey}-${sectionIndex}`}>Help text (optional)</label>
        <input id={`helpText-${stepKey}-${sectionIndex}`} maxLength={300} name="helpText" type="text" />

        <button className="button button--primary" type="submit">Add question</button>
      </form>
    </details>
  );
}

export function RoundBuilder({
  courseId,
  courseTitle,
  error,
  mode,
  profile,
  roundId,
  roundName,
  spec,
}: {
  courseId: number;
  courseTitle: string;
  error: string | null;
  mode: RoundMode;
  profile: Profile;
  roundId: number;
  roundName: string;
  spec: FormSpec;
}) {
  const verdict = readyForStudents(spec);

  return (
    <RoleShell profile={profile} title={roundName}>
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <p><Link href={`/admin/courses/${courseId}`}>← {courseTitle}</Link></p>

      {mode === "offline" ? (
        <section className="panel">
          <h2>This round happens off the platform</h2>
          <p className="muted">
            Interviews and group discussions are arranged elsewhere. The student sees the round
            and its dates; the mentor records the outcome afterwards. There is no form to build.
          </p>
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="panel__header">
              <div>
                <h2>The form</h2>
                <p className="muted">
                  {spec.steps.length} {spec.steps.length === 1 ? "page" : "pages"} ·{" "}
                  {countFields(spec)} {countFields(spec) === 1 ? "question" : "questions"}
                </p>
              </div>
              {verdict.ready ? (
                <span className="pill">Ready for students</span>
              ) : (
                <span className="pill pill--disabled">Not finished</span>
              )}
            </div>

            {verdict.ready ? null : <p className="muted">{verdict.reason}</p>}

            {spec.steps.map((step, stepIndex) => (
              <section className="panel" key={step.key}>
                <div className="panel__header">
                  <div>
                    <h3>Page {stepIndex + 1} — {step.title}</h3>
                    {step.subtitle ? <p className="muted">{step.subtitle}</p> : null}
                  </div>
                  <p className="muted">
                    {fieldsForStep(step).length}{" "}
                    {fieldsForStep(step).length === 1 ? "question" : "questions"}
                  </p>
                </div>

                <details>
                  <summary>Rename this page</summary>
                  <form action={renamePageAction} className="stack-form">
                    <input name="courseId" type="hidden" value={courseId} />
                    <input name="roundId" type="hidden" value={roundId} />
                    <input name="stepKey" type="hidden" value={step.key} />
                    <label htmlFor={`page-title-${step.key}`}>Page name</label>
                    <input defaultValue={step.title} id={`page-title-${step.key}`} maxLength={200} name="title" required type="text" />
                    <button className="button button--primary" type="submit">Rename</button>
                  </form>
                  <form action={setPageSubtitleAction} className="stack-form">
                    <input name="courseId" type="hidden" value={courseId} />
                    <input name="roundId" type="hidden" value={roundId} />
                    <input name="stepKey" type="hidden" value={step.key} />
                    <label htmlFor={`page-sub-${step.key}`}>Line beneath the heading</label>
                    <input defaultValue={step.subtitle ?? ""} id={`page-sub-${step.key}`} maxLength={300} name="subtitle" type="text" />
                    <button className="button button--secondary" type="submit">Save line</button>
                  </form>
                  {spec.steps.length > 1 ? (
                    <form action={removePageAction}>
                      <input name="courseId" type="hidden" value={courseId} />
                      <input name="roundId" type="hidden" value={roundId} />
                      <input name="stepKey" type="hidden" value={step.key} />
                      <button className="button button--secondary" type="submit">Delete this page</button>
                    </form>
                  ) : null}
                </details>

                {step.sections.map((section, sectionIndex) => (
                  <div key={`${step.key}-${sectionIndex}`}>
                    <div className="panel__header">
                      <h4>{section.title ?? "Questions"}</h4>
                      {step.sections.length > 1 ? (
                        <form action={removeSectionAction}>
                          <input name="courseId" type="hidden" value={courseId} />
                          <input name="roundId" type="hidden" value={roundId} />
                          <input name="stepKey" type="hidden" value={step.key} />
                          <input name="sectionIndex" type="hidden" value={sectionIndex} />
                          <button className="button button--secondary" type="submit">Remove section</button>
                        </form>
                      ) : null}
                    </div>

                    {section.fields.length === 0 ? (
                      <p className="muted">No question here yet.</p>
                    ) : (
                      section.fields.map((field) => (
                        <FieldRow courseId={courseId} field={field} key={field.key} roundId={roundId} />
                      ))
                    )}

                    <details>
                      <summary>Rename this section</summary>
                      <form action={renameSectionAction} className="stack-form">
                        <input name="courseId" type="hidden" value={courseId} />
                        <input name="roundId" type="hidden" value={roundId} />
                        <input name="stepKey" type="hidden" value={step.key} />
                        <input name="sectionIndex" type="hidden" value={sectionIndex} />
                        <label htmlFor={`sec-${step.key}-${sectionIndex}`}>Section heading</label>
                        <input
                          defaultValue={section.title ?? ""}
                          id={`sec-${step.key}-${sectionIndex}`}
                          maxLength={200}
                          name="title"
                          type="text"
                        />
                        <button className="button button--primary" type="submit">Save heading</button>
                      </form>
                    </details>

                    <AddField
                      courseId={courseId}
                      roundId={roundId}
                      sectionIndex={sectionIndex}
                      stepKey={step.key}
                    />
                  </div>
                ))}

                <details>
                  <summary>Add a section to this page</summary>
                  <form action={addSectionAction} className="stack-form">
                    <input name="courseId" type="hidden" value={courseId} />
                    <input name="roundId" type="hidden" value={roundId} />
                    <input name="stepKey" type="hidden" value={step.key} />
                    <label htmlFor={`new-sec-${step.key}`}>Section heading</label>
                    <input id={`new-sec-${step.key}`} maxLength={200} name="title" placeholder="Parent / Guardian Details" type="text" />
                    <button className="button button--primary" type="submit">Add section</button>
                  </form>
                </details>
              </section>
            ))}

            <details>
              <summary>Add a page</summary>
              <form action={addPageAction} className="stack-form">
                <input name="courseId" type="hidden" value={courseId} />
                <input name="roundId" type="hidden" value={roundId} />
                <label htmlFor="new-page">Page name</label>
                <input id="new-page" maxLength={200} name="title" placeholder="Academic Details" required type="text" />
                <button className="button button--primary" type="submit">Add page</button>
              </form>
            </details>
          </section>

          <RoundPreview spec={spec} />
        </>
      )}
    </RoleShell>
  );
}
