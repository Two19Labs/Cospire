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
  short_text: "Short text",
  long_text: "Long answer",
  select: "Dropdown",
  radio: "Multiple choice",
  single_choice: "Single choice",
  checkbox: "Checkbox",
  date: "Date",
  month_year: "Month and year",
  number: "Number",
  file: "File upload",
  score_list: "Score list (exam + score)",
};

function Ids({ courseId, roundId }: { courseId: number; roundId: number }) {
  return (
    <>
      <input name="courseId" type="hidden" value={courseId} />
      <input name="roundId" type="hidden" value={roundId} />
    </>
  );
}

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
    <div className="builder__field">
      <div>
        <strong>{field.label}</strong>
        <p>{detail}</p>
      </div>
      <div className="builder__field-actions">
        {(["up", "down"] as const).map((direction) => (
          <form action={moveFieldAction} key={direction}>
            <Ids courseId={courseId} roundId={roundId} />
            <input name="fieldKey" type="hidden" value={field.key} />
            <input name="direction" type="hidden" value={direction} />
            <button
              aria-label={`Move ${field.label} ${direction}`}
              className="builder__icon"
              type="submit"
            >
              {direction === "up" ? "↑" : "↓"}
            </button>
          </form>
        ))}
        <form action={removeFieldAction}>
          <Ids courseId={courseId} roundId={roundId} />
          <input name="fieldKey" type="hidden" value={field.key} />
          <button
            aria-label={`Remove ${field.label}`}
            className="builder__icon builder__icon--danger"
            type="submit"
          >
            ✕
          </button>
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
  const uid = `${stepKey}-${sectionIndex}`;
  return (
    <details className="builder__disclosure">
      <summary>+ Add a question</summary>
      <form action={addFieldAction} className="stack-form builder__addq">
        <Ids courseId={courseId} roundId={roundId} />
        <input name="stepKey" type="hidden" value={stepKey} />
        <input name="sectionIndex" type="hidden" value={sectionIndex} />

        <div className="builder__grid builder__grid--pair">
          <div className="builder__field-group">
            <label htmlFor={`label-${uid}`}>Question</label>
            <input id={`label-${uid}`} maxLength={200} name="label" placeholder="Full Name" required type="text" />
          </div>
          <div className="builder__field-group">
            <label htmlFor={`type-${uid}`}>Type</label>
            <select defaultValue="short_text" id={`type-${uid}`} name="type">
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Shown only for the types that can have options. See the `:has()`
            rule in globals.css -- no JavaScript, and it falls back to showing
            everything where `:has()` is unsupported. */}
        <div className="builder__options builder__field-group">
          <label htmlFor={`options-${uid}`}>Options — one per line</label>
          <textarea id={`options-${uid}`} name="options" placeholder={"Male\nFemale\nOther"} rows={3} />
        </div>

        <div className="builder__wordlimit builder__field-group">
          <label htmlFor={`wordLimit-${uid}`}>Word limit</label>
          <input id={`wordLimit-${uid}`} inputMode="numeric" name="wordLimit" placeholder="200" type="text" />
        </div>

        <div className="builder__field-group">
          <label htmlFor={`helpText-${uid}`}>Help text (optional)</label>
          <input id={`helpText-${uid}`} maxLength={300} name="helpText" type="text" />
        </div>

        <label className="choice" htmlFor={`required-${uid}`}>
          <input defaultChecked id={`required-${uid}`} name="required" type="checkbox" />
          <span>Required</span>
        </label>

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
  const fieldCount = countFields(spec);

  if (mode === "offline") {
    return (
      <RoleShell profile={profile} title={roundName}>
        <p><Link href={`/admin/ars/${courseId}`}>← {courseTitle} ARS</Link></p>
        <section className="panel">
          <h2>This round happens off the platform</h2>
          <p className="muted">
            Interviews and group discussions are arranged elsewhere. The student sees the round
            and its dates; the mentor records the outcome afterwards. There is no form to build.
          </p>
        </section>
      </RoleShell>
    );
  }

  return (
    <RoleShell profile={profile} title={roundName}>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <p><Link href={`/admin/ars/${courseId}`}>← {courseTitle} ARS</Link></p>

      <div className="builder">
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>The form</h2>
              <p className="muted">
                {spec.steps.length} {spec.steps.length === 1 ? "page" : "pages"} · {fieldCount}{" "}
                {fieldCount === 1 ? "question" : "questions"}
              </p>
            </div>
            <span className={verdict.ready ? "pill pill--active" : "pill pill--disabled"}>
              {verdict.ready ? "Ready for students" : "Not finished"}
            </span>
          </div>

          {verdict.ready ? null : <p className="muted">{verdict.reason}</p>}

          {spec.steps.map((step, stepIndex) => (
            <div className="builder__page" key={step.key}>
              <div className="builder__page-head">
                <div>
                  <span className="builder__number">{stepIndex + 1}</span>{" "}
                  <strong>{step.title}</strong>
                  {step.subtitle ? <p className="muted">{step.subtitle}</p> : null}
                </div>
                <span className="muted">
                  {fieldsForStep(step).length}{" "}
                  {fieldsForStep(step).length === 1 ? "question" : "questions"}
                </span>
              </div>

              {step.sections.map((section, sectionIndex) => (
                <div className="builder__section" key={`${step.key}-${sectionIndex}`}>
                  <div className="builder__section-head">
                    <h4>{section.title ?? "Questions"}</h4>
                    {step.sections.length > 1 ? (
                      <form action={removeSectionAction}>
                        <Ids courseId={courseId} roundId={roundId} />
                        <input name="stepKey" type="hidden" value={step.key} />
                        <input name="sectionIndex" type="hidden" value={sectionIndex} />
                        <button
                          aria-label={`Remove section ${section.title ?? sectionIndex + 1}`}
                          className="builder__icon builder__icon--danger"
                          type="submit"
                        >
                          ✕
                        </button>
                      </form>
                    ) : null}
                  </div>

                  {section.fields.length === 0 ? (
                    <p className="builder__hint">No question here yet.</p>
                  ) : (
                    section.fields.map((field) => (
                      <FieldRow courseId={courseId} field={field} key={field.key} roundId={roundId} />
                    ))
                  )}

                  <AddField
                    courseId={courseId}
                    roundId={roundId}
                    sectionIndex={sectionIndex}
                    stepKey={step.key}
                  />

                  <details className="builder__disclosure">
                    <summary>Rename this section</summary>
                    <form action={renameSectionAction} className="stack-form">
                      <Ids courseId={courseId} roundId={roundId} />
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
                </div>
              ))}

              <details className="builder__disclosure">
                <summary>Page settings</summary>
                <form action={renamePageAction} className="stack-form">
                  <Ids courseId={courseId} roundId={roundId} />
                  <input name="stepKey" type="hidden" value={step.key} />
                  <label htmlFor={`page-title-${step.key}`}>Page name</label>
                  <input
                    defaultValue={step.title}
                    id={`page-title-${step.key}`}
                    maxLength={200}
                    name="title"
                    required
                    type="text"
                  />
                  <button className="button button--primary" type="submit">Rename page</button>
                </form>
                <form action={setPageSubtitleAction} className="stack-form">
                  <Ids courseId={courseId} roundId={roundId} />
                  <input name="stepKey" type="hidden" value={step.key} />
                  <label htmlFor={`page-sub-${step.key}`}>Line beneath the heading</label>
                  <input
                    defaultValue={step.subtitle ?? ""}
                    id={`page-sub-${step.key}`}
                    maxLength={300}
                    name="subtitle"
                    type="text"
                  />
                  <button className="button button--secondary" type="submit">Save line</button>
                </form>
                <form action={addSectionAction} className="stack-form">
                  <Ids courseId={courseId} roundId={roundId} />
                  <input name="stepKey" type="hidden" value={step.key} />
                  <label htmlFor={`new-sec-${step.key}`}>New section heading</label>
                  <input
                    id={`new-sec-${step.key}`}
                    maxLength={200}
                    name="title"
                    placeholder="Parent / Guardian Details"
                    type="text"
                  />
                  <button className="button button--secondary" type="submit">Add section</button>
                </form>
                {spec.steps.length > 1 ? (
                  <form action={removePageAction} className="stack-form">
                    <Ids courseId={courseId} roundId={roundId} />
                    <input name="stepKey" type="hidden" value={step.key} />
                    <button className="button button--secondary" type="submit">Delete this page</button>
                  </form>
                ) : null}
              </details>
            </div>
          ))}

          <details className="builder__disclosure">
            <summary>+ Add a page</summary>
            <form action={addPageAction} className="stack-form">
              <Ids courseId={courseId} roundId={roundId} />
              <label htmlFor="new-page">Page name</label>
              <input id="new-page" maxLength={200} name="title" placeholder="Academic Details" required type="text" />
              <button className="button button--primary" type="submit">Add page</button>
            </form>
          </details>
        </section>

        <div className="builder__preview">
          <RoundPreview spec={spec} />
        </div>
      </div>
    </RoleShell>
  );
}
