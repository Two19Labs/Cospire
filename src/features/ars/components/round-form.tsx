import Link from "next/link";
import type { CSSProperties } from "react";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

import { saveDraftAction, submitRoundAction } from "../actions/submission-actions";
import { fieldsForStep, stepProgress, type FormField, type FormSection } from "../form-schema";
import type { RoundForStudent } from "../queries/student-process";
import { FileUploadField } from "./file-upload-field";
import { SubmitButton } from "@/shared/ui";

// One student route rendering whichever shape the round declares, per the ARS
// design: `submission_mode` plus `config` describe the form, and this walks it.
// Adding a round is data entry, not a new screen.
//
// Server Components and plain forms throughout, so the no-JavaScript path is the
// only path. The word counter is the one thing that would want script, and it is
// rendered as a static limit rather than a live count for that reason.

const errorMessages: Record<string, string> = {
  "already-submitted": "You have already handed this in, so it can no longer be changed.",
  "bad-date": "Check the date you entered.",
  "bad-email": "Check the email address you entered.",
  "bad-month": "Enter the month and year as YYYY-MM, for example 2025-03.",
  "bad-phone": "Enter a 10-digit Indian mobile number.",
  "bad-result":
    "A result must match its marking scheme: 0 to 100 for Percentage, 0 to 10 for CGPA, a grade such as A1 for Grades.",
  "future-date": "That date is in the future.",
  "invalid-request": "That request could not be read.",
  "missing-required": "Some required answers are still empty.",
  "no-form": "This round has nothing to fill in.",
  "not-an-option": "Choose one of the options offered.",
  "not-a-number": "That needs to be a number.",
  "not-your-turn": "Finish the earlier step first.",
  "not-found": "That round no longer exists.",
  "out-of-range": "One of the numbers or years is outside the range allowed.",
  "save-failed": "That could not be saved.",
  "too-long": "That answer is too long.",
  "too-many-words": "That answer is over the word limit.",
};

const noticeMessages: Record<string, string> = {
  saved: "Saved.",
  submitted: "Handed in. Your mentor will review it.",
};

// Every field renders as one `.field` block: a label above its control, never
// beside it. Before this they were emitted as bare <label> and <input>
// siblings with no wrapper and no classes, so the grid laid them out inline and
// a four-page application read as one run-on line of boxes.
// A section shown only for some answers is hidden by CSS rather than script:
// `:has()` sees which option is chosen, so the page reacts as the student picks
// and still works with JavaScript off. A browser without `:has()` shows every
// section, and the server drops whatever a hidden section posted.
function cssString(value: string): string {
  return `"${value.replace(/[\\"<>\n\r]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`;
}

function showWhenCss(sections: FormSection[]): string {
  return sections
    .map((section, index) => {
      const rule = section.showWhen;
      if (!rule) return "";
      const value = cssString("equals" in rule ? rule.equals : rule.notEquals);
      const chosen = `[name="${rule.field}"][value=${value}]:checked, [name="${rule.field}"] option[value=${value}]:checked`;
      const when = "equals" in rule ? `:not(:has(${chosen}))` : `:has(${chosen})`;
      return `.round-form${when} [data-section="${index}"] { display: none; }`;
    })
    .join(" ");
}

// India's date, matching the server's check on a date that may not be future.
function todayInIndia(): string {
  return new Date(Date.now() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 10);
}

function Field({
  conditional,
  field,
  roundId,
  value,
}: {
  conditional: boolean;
  field: FormField;
  roundId: number;
  value: unknown;
}) {
  const id = `f-${field.key}`;
  // A hidden required input would stop the browser submitting at all, so a
  // conditional section leaves "required" to the server.
  const common = { id, name: field.key, required: field.required && !conditional };
  const optional = field.required ? null : <span className="field__optional">Optional</span>;
  const hint = field.helpText ? <p className="field__hint">{field.helpText}</p> : null;

  if (field.type === "score_list") {
    return (
      <fieldset className="field">
        <legend className="field__label">
          {field.label}
          {optional}
        </legend>
        {hint}
        <div className="field-row">
          {(field.options ?? []).map((option) => {
            const stored =
              typeof value === "object" && value !== null ? (value as Record<string, string>) : {};
            return (
              <label className="field" htmlFor={`${id}-${option}`} key={option}>
                <span className="field__label">{option}</span>
                <input
                  className="input"
                  defaultValue={stored[option] ?? ""}
                  id={`${id}-${option}`}
                  name={`${field.key}::${option}`}
                  placeholder="Score"
                  type="text"
                />
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  const label = (
    <label className="field__label" htmlFor={id}>
      {field.label}
      {optional}
    </label>
  );

  if (field.type === "long_text") {
    return (
      <div className="field">
        {label}
        {hint}
        <textarea
          {...common}
          className="input input--area"
          defaultValue={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          rows={8}
        />
        {field.wordLimit ? (
          <p className="field__hint">Maximum {field.wordLimit} words.</p>
        ) : null}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="field">
        {label}
        <select {...common} className="input" defaultValue={typeof value === "string" ? value : ""}>
          <option value="">Select…</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {hint}
      </div>
    );
  }

  if (field.type === "radio" || field.type === "single_choice") {
    return (
      <fieldset className="field">
        <legend className="field__label">
          {field.label}
          {optional}
        </legend>
        <div className="choice-list">
          {(field.options ?? []).map((option) => (
            <label className="choice" htmlFor={`${id}-${option}`} key={option}>
              <input
                defaultChecked={value === option}
                id={`${id}-${option}`}
                name={field.key}
                type="radio"
                value={option}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        {hint}
      </fieldset>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="field">
        <label className="choice" htmlFor={id}>
          <input defaultChecked={value === true} id={id} name={field.key} type="checkbox" />
          <span>{field.label}</span>
        </label>
        {hint}
      </div>
    );
  }

  if (field.type === "file") {
    return <FileUploadField field={field} roundId={roundId} value={value} />;
  }

  const inputType =
    field.type === "date"
      ? "date"
      : field.type === "number"
        ? "number"
        : field.type === "month_year"
          ? "month"
          : field.format === "email"
            ? "email"
            : field.format === "phone"
              ? "tel"
              : "text";
  const bounds =
    field.type === "number"
      ? { max: field.max, min: field.min, step: "any" }
      : field.type === "month_year"
        ? {
            max: field.max === undefined ? undefined : `${field.max}-12`,
            min: field.min === undefined ? undefined : `${field.min}-01`,
          }
        : field.type === "date" && field.pastOnly
          ? { max: todayInIndia() }
          : {};

  return (
    <div className="field">
      {label}
      <input
        {...common}
        className="input"
        defaultValue={
          typeof value === "string" || typeof value === "number" ? String(value) : ""
        }
        disabled={Boolean(field.prefill)}
        placeholder={field.placeholder ?? (field.type === "month_year" ? "YYYY-MM" : undefined)}
        type={inputType}
        {...bounds}
      />
      {/* A prefilled field is filled from the account and disabled, so say why
          rather than leaving the student wondering why they cannot type. */}
      {field.prefill ? (
        <p className="field__hint">Taken from your account.</p>
      ) : (
        hint
      )}
    </div>
  );
}

export function RoundForm({
  error,
  notice,
  profile,
  round,
  stepIndex,
}: {
  error: string | null;
  notice: string | null;
  profile: Profile;
  round: RoundForStudent;
  stepIndex: number;
}) {
  const locked = round.status === "submitted" || round.status === "reviewed";

  return (
    <RoleShell
      back={{ href: "/student/ars", label: `Back to ${round.courseTitle}` }}
      profile={profile}
      title={round.name}
    >
      {error ? (
        <p className="form-error" role="alert">{errorMessages[error] ?? errorMessages["save-failed"]}</p>
      ) : null}
      {notice ? (
        <p className="notice notice--success" role="status">{noticeMessages[notice] ?? "Saved."}</p>
      ) : null}

      {round.submissionMode === "offline" ? (
        <section className="panel">
          <h2>{round.name}</h2>
          <p className="muted">
            This step happens off the platform. Your mentor will confirm the arrangements and
            record the outcome here afterwards.
          </p>
        </section>
      ) : locked ? (
        <section className="panel">
          <h2>Handed in</h2>
          <p className="muted">
            {round.status === "reviewed"
              ? "Your mentor has reviewed this."
              : "Your mentor will review this."}
            {round.isLate ? " It was submitted after the deadline." : ""}
          </p>
        </section>
      ) : !round.spec ? (
        <section className="panel">
          <h2>Nothing to fill in</h2>
          <p className="muted">This round has no questions set up yet.</p>
        </section>
      ) : (
        (() => {
          const steps = round.spec.steps;
          const index = Math.min(Math.max(stepIndex, 0), steps.length - 1);
          const step = steps[index];
          const isLast = index === steps.length - 1;

          return (
            <section className="panel">
              <div className="panel__header">
                <div>
                  <h2>{step.title}</h2>
                  {step.subtitle ? <p className="muted">{step.subtitle}</p> : null}
                </div>
                <div className="step-progress">
                  <p className="muted">
                    Step {index + 1} of {steps.length}
                  </p>
                  <div
                    aria-hidden="true"
                    className="step-progress__track"
                    style={{
                      // The one inline style in this file, because the value is
                      // data rather than design: it is the step the student has
                      // reached, not a look.
                      "--progress": `${stepProgress({
                        stepCount: steps.length,
                        stepIndex: index,
                      })}%`,
                    } as CSSProperties}
                  >
                    <span className="step-progress__fill" />
                  </div>
                </div>
              </div>

              <form action={isLast ? submitRoundAction : saveDraftAction} className="round-form stack-form stack-form--wide">
                {step.sections.some((section) => section.showWhen) ? (
                  // Raw, because React would entity-escape the quotes the
                  // selectors need. `cssString` hex-escapes < > " and newlines.
                  <style dangerouslySetInnerHTML={{ __html: showWhenCss(step.sections) }} />
                ) : null}
                <input name="roundId" type="hidden" value={round.roundId} />
                <input name="stepIndex" type="hidden" value={index} />

                {step.sections.map((section, sectionIndex) => (
                  <section
                    className="form-section"
                    data-section={section.showWhen ? sectionIndex : undefined}
                    key={section.title ?? sectionIndex}
                  >
                    {section.title ? (
                      <h3 className="form-section__title">{section.title}</h3>
                    ) : null}
                    {section.description ? (
                      <p className="muted">{section.description}</p>
                    ) : null}
                    {section.fields.length > 0 ? (
                      <div className="form-fields">
                        {section.fields.map((field) => (
                          <Field
                            conditional={Boolean(section.showWhen)}
                            field={field}
                            key={field.key}
                            roundId={round.roundId}
                            value={round.answer[field.key]}
                          />
                        ))}
                      </div>
                    ) : null}
                  </section>
                ))}

                <div className="form-actions">
                  <SubmitButton pendingLabel={isLast ? "Handing in…" : "Saving…"} variant="primary">
                    {isLast ? "Hand in" : "Save & continue →"}
                  </SubmitButton>
                </div>
              </form>

              <nav aria-label="Pagination" className="pagination">
                {index > 0 ? (
                  <Link href={`/student/ars/${round.roundId}?step=${index}`} rel="prev">Back</Link>
                ) : (
                  <span className="muted">Back</span>
                )}
                <span className="muted">
                  {fieldsForStep(step).length} question{fieldsForStep(step).length === 1 ? "" : "s"}
                </span>
                <span className="muted">{isLast ? "Last step" : "Next"}</span>
              </nav>
            </section>
          );
        })()
      )}
    </RoleShell>
  );
}
