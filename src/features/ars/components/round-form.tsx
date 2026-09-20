import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

import { saveDraftAction, submitRoundAction } from "../actions/submission-actions";
import { fieldsForStep, stepProgress, type FormField } from "../form-schema";
import type { RoundForStudent } from "../queries/student-process";

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
  "invalid-request": "That request could not be read.",
  "missing-required": "Some required answers are still empty.",
  "no-form": "This round has nothing to fill in.",
  "not-an-option": "Choose one of the options offered.",
  "not-a-number": "That needs to be a number.",
  "not-your-turn": "Finish the earlier step first.",
  "not-found": "That round no longer exists.",
  "save-failed": "That could not be saved.",
  "too-long": "That answer is too long.",
  "too-many-words": "That answer is over the word limit.",
};

const noticeMessages: Record<string, string> = {
  saved: "Saved.",
  submitted: "Handed in. Your mentor will review it.",
};

function Field({ field, value }: { field: FormField; value: unknown }) {
  const id = `f-${field.key}`;
  const common = { id, name: field.key, required: field.required };

  if (field.type === "score_list") {
    return (
      <fieldset>
        <legend>{field.label}</legend>
        {field.helpText ? <p className="muted">{field.helpText}</p> : null}
        {(field.options ?? []).map((option) => {
          const stored = typeof value === "object" && value !== null ? (value as Record<string, string>) : {};
          return (
            <div className="field-row" key={option}>
              <label htmlFor={`${id}-${option}`}>{option}</label>
              <input
                defaultValue={stored[option] ?? ""}
                id={`${id}-${option}`}
                name={`${field.key}::${option}`}
                placeholder="Enter score"
                type="text"
              />
            </div>
          );
        })}
      </fieldset>
    );
  }

  const label = (
    <label htmlFor={id}>
      {field.label}
      {field.required ? "" : " (optional)"}
    </label>
  );

  if (field.type === "long_text") {
    return (
      <>
        {label}
        {field.helpText ? <p className="muted">{field.helpText}</p> : null}
        <textarea
          {...common}
          defaultValue={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          rows={8}
        />
        {field.wordLimit ? <p className="muted">Maximum {field.wordLimit} words.</p> : null}
      </>
    );
  }

  if (field.type === "select") {
    return (
      <>
        {label}
        <select {...common} defaultValue={typeof value === "string" ? value : ""}>
          <option value="">Select…</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        {field.helpText ? <p className="muted">{field.helpText}</p> : null}
      </>
    );
  }

  if (field.type === "radio" || field.type === "single_choice") {
    return (
      <fieldset>
        <legend>{field.label}</legend>
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
        {field.helpText ? <p className="muted">{field.helpText}</p> : null}
      </fieldset>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="choice" htmlFor={id}>
        <input defaultChecked={value === true} id={id} name={field.key} type="checkbox" />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === "file") {
    return (
      <>
        {label}
        <p className="muted">
          File upload is not available yet on this round. Your mentor will tell you where to
          send it.
        </p>
      </>
    );
  }

  const inputType =
    field.type === "date" ? "date" : field.type === "number" ? "number" : "text";

  return (
    <>
      {label}
      <input
        {...common}
        defaultValue={typeof value === "string" || typeof value === "number" ? String(value) : ""}
        disabled={Boolean(field.prefill)}
        placeholder={field.placeholder}
        type={inputType}
      />
      {field.helpText ? <p className="muted">{field.helpText}</p> : null}
    </>
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
    <RoleShell profile={profile} title={round.name}>
      {error ? (
        <p className="form-error" role="alert">{errorMessages[error] ?? errorMessages["save-failed"]}</p>
      ) : null}
      {notice ? <p className="muted">{noticeMessages[notice] ?? "Saved."}</p> : null}

      <p><Link href="/student/ars">← {round.courseTitle}</Link></p>

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
                <p className="muted">
                  Step {index + 1} of {steps.length} · {stepProgress({ stepCount: steps.length, stepIndex: index })}%
                </p>
              </div>

              <form action={isLast ? submitRoundAction : saveDraftAction} className="stack-form">
                <input name="roundId" type="hidden" value={round.roundId} />
                <input name="stepIndex" type="hidden" value={index} />

                {step.sections.map((section, sectionIndex) => (
                  <div key={section.title ?? sectionIndex}>
                    {section.title ? <h3>{section.title}</h3> : null}
                    {section.description ? <p className="muted">{section.description}</p> : null}
                    {section.fields.map((field) => (
                      <Field field={field} key={field.key} value={round.answer[field.key]} />
                    ))}
                  </div>
                ))}

                <button className="button button--primary" type="submit">
                  {isLast ? "Hand in" : "Save & continue →"}
                </button>
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
