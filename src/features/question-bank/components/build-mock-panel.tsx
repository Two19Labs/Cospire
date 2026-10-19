import { SubmitButton } from "@/shared/ui";

import { buildMockFromImportAction, createPaperSectionAction } from "../actions/build-mock-actions";
import type { ImportRound } from "@/features/ars/queries/round-import";

import type { BuildMockOptions } from "../queries/build-mock-options";
import styles from "./build-mock-panel.module.css";
import { PendingOverlay } from "./pending-overlay";

// The last step of mock-first import (D7, D13, D15): once every question is
// decided, build the mock from the paper. Optional -- a practice sheet that only
// feeds the bank is never built into one -- and open by default when the import
// started from Mock tests.

const buildErrors: Record<string, string> = {
  archived: "A question in the paper has been archived since it was approved. Restore it, or build the mock by hand.",
  duration: "The section minutes must add up exactly to the full duration.",
  empty: "Nothing was approved, so there is nothing to build a mock from.",
  failed: "The mock could not be saved.",
  invalid: "Check the title, duration, attempt limit and penalty.",
  marks: "Marks must be a number above 0 and at most 100, or left blank.",
  minutes: "With sectional timing, every section needs its minutes.",
  pending: "Decide every question first. A mock built now would leave the undecided ones out.",
  questions: "Some of the paper's questions could not be read. Reload and try again.",
  structure: "The database refused that mock structure.",
  "too-many-sections": "The paper uses more sections than one mock can time separately. Use overall timing.",
};

export function MissingSections({ batchId, mock, names }: { batchId: string; mock: boolean; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <section className="panel">
      <h2>Sections this paper uses that the bank does not have</h2>
      <p className="muted">Create them here; every question naming one is then ready to approve.</p>
      <ul className="report-list">
        {names.map((name) => (
          <li className="report-list__item" key={name}>
            <form action={createPaperSectionAction} className="row-form">
              <input name="batchId" type="hidden" value={batchId} />
              <input name="name" type="hidden" value={name} />
              <input name="mock" type="hidden" value={mock ? "1" : ""} />
              <strong>{name}</strong>{" "}
              <SubmitButton compact pendingLabel="Creating…" variant="secondary">{`Create “${name}”`}</SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BuildMockPanel({
  batchId,
  defaultMarks,
  error,
  linkedRound = null,
  open,
  options,
  pending,
  roundRefused = false,
  title,
}: {
  batchId: string;
  defaultMarks: string;
  error: string | null;
  // The ARS aptitude round this import was started from (D8), if any.
  linkedRound?: ImportRound | null;
  open: boolean;
  roundRefused?: boolean;
  options: BuildMockOptions;
  pending: number;
  title: string;
}) {
  const { courses, sections, students } = options;
  const questionCount = sections.reduce((sum, section) => sum + section.questionCount, 0);
  const notices = (
    <>
      {error && buildErrors[error] ? <p className="notice notice--error">{buildErrors[error]}</p> : null}
      {linkedRound ? <p className="notice">The mock built here is linked to the ARS round <strong>{linkedRound.name}</strong> automatically.</p> : null}
      {roundRefused && !linkedRound ? <p className="notice notice--error">This import could not be tied to its ARS round, so the mock will not link itself. Link it from the round&apos;s page after building.</p> : null}
    </>
  );

  // Not ready yet: a quiet disclosure under the review, saying what is left.
  if (pending > 0 || questionCount === 0) {
    return (
      <details className="panel" id="build" open={open || error !== null}>
        <summary>
          <strong>Build a mock from this paper</strong>
          <span className="muted"> · optional</span>
        </summary>
        {notices}
        {pending > 0 ? (
          <p className="notice notice--warn">
            {pending} {pending === 1 ? "question is" : "questions are"} still to decide. Build the mock once every question is
            approved or rejected.
          </p>
        ) : (
          <p className="muted">Nothing was approved, so there is nothing to build a mock from.</p>
        )}
      </details>
    );
  }

  // The paper's own timing, when it gave every section its minutes (2026-10-19).
  const paperTimed = sections.length > 0 && sections.every((section) => section.minutes !== null);
  const paperTotal = sections.reduce((sum, section) => sum + (section.minutes ?? 0), 0);

  return (
    <section className="panel" id="build">
      <div className="panel__header">
        <div>
          <h2>Build the mock from this paper</h2>
          <p className="muted">
            {questionCount} {questionCount === 1 ? "question" : "questions"} (a DI set counts once) in {sections.length}{" "}
            {sections.length === 1 ? "section" : "sections"}, in the paper&apos;s order. Every question is already in the bank.
          </p>
        </div>
        <span className="tag tag--sage">Review finished</span>
      </div>
      {notices}

      <form action={buildMockFromImportAction} className="stack-form">
        <input name="batchId" type="hidden" value={batchId} />

        <div className="form-section">
          <h3 className="form-section__title">The mock</h3>
          <div className="form-fields">
            <label className="field">
              <span className="field__label">Title</span>
              <input className="input" defaultValue={title} maxLength={160} name="title" required />
            </label>
            <label className="field">
              <span className="field__label">Full duration (minutes)</span>
              <input className="input" defaultValue={paperTimed ? paperTotal : 120} max={1440} min={1} name="durationMinutes" required type="number" />
            </label>
            <label className="field">
              <span className="field__label">Attempt limit</span>
              <input className="input" defaultValue={1} max={100} min={1} name="maxAttempts" required type="number" />
            </label>
            <label className="field">
              <span className="field__label">Instructions</span>
              <textarea className="input input--area" maxLength={20000} name="instructions" rows={3} />
            </label>
          </div>
        </div>

        <fieldset className="form-section field">
          <legend className="form-section__title">Sections and timing</legend>
          <p className="muted">
            The sections come from the paper.{" "}
            {paperTimed ? "It states each section's time, filled in below." : "It gives no time per section."}
          </p>
          <div className="toggle-list">
            <label className="choice">
              <input defaultChecked={!paperTimed} name="timingMode" type="radio" value="overall" />{" "}
              <span>One overall timer: students move freely between sections</span>
            </label>
            <label className="choice">
              <input defaultChecked={paperTimed} name="timingMode" type="radio" value="sectional" />{" "}
              <span>A timer per section: sat in order, locked once left</span>
            </label>
          </div>
          <ol className={styles.sections}>
            {sections.map((section, index) => (
              <li className={styles.section} key={section.id}>
                <span aria-hidden="true" className={styles.number}>
                  {index + 1}
                </span>
                <span className={styles.name}>
                  <strong>{section.name}</strong>
                  <span className="muted">
                    {section.questionCount} {section.questionCount === 1 ? "question" : "questions"}
                  </span>
                </span>
                <label className={styles.minutes}>
                  <input
                    aria-label={`Minutes for ${section.name}`}
                    className="input input--compact"
                    defaultValue={section.minutes ?? ""}
                    max={1440}
                    min={1}
                    name={`minutes_${section.id}`}
                    placeholder="—"
                    type="number"
                  />
                  <span className="muted">min</span>
                </label>
              </li>
            ))}
          </ol>
          <span className="field__hint">Minutes are used only with a timer per section, and must add up to the full duration.</span>
        </fieldset>

        <div className="form-section">
          <h3 className="form-section__title">Scoring</h3>
          <div className="form-fields">
            <label className="field">
              <span className="field__label">Marks per correct answer</span>
              <input className="input" defaultValue={defaultMarks} max={100} min={0.01} name="marks" placeholder="Each question's own" step="0.01" type="number" />
            </label>
            <label className="field">
              <span className="field__label">Penalty per wrong answer</span>
              <input className="input" defaultValue="0" max={100} min={0} name="negativeMarking" step="0.01" required type="number" />
            </label>
          </div>
          <fieldset className="field">
            <legend className="field__label">Negative marking applies to</legend>
            <div className="toggle-list">
              {[
                ["mcq", "Single-correct MCQ"],
                ["mcq_multi", "Multiple-correct MCQ"],
                ["numerical", "Numerical"],
              ].map(([type, label]) => (
                <label className="choice" key={type}>
                  <input defaultChecked={type !== "numerical"} name={`negative_${type}`} type="checkbox" /> <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="form-section">
          <h3 className="form-section__title">Delivery</h3>
          <div className="toggle-list">
            <label className="choice">
              <input defaultChecked name="allowMobile" type="checkbox" /> <span>Allow phone attempts (always unproctored)</span>
            </label>
            <label className="choice">
              <input name="proctoringEnabled" type="checkbox" /> <span>Enable proctoring</span>
            </label>
          </div>
        </div>

        <fieldset className="form-section field">
          <legend className="form-section__title">Who takes it</legend>
          <label className="field">
            <span className="field__label">Everyone on a programme or ARS process</span>
            <select className="input" defaultValue={linkedRound ? String(linkedRound.courseId) : ""} name="grantCourseId">
              <option value="">Nobody this way</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {`${course.title} (${course.kind === "ars_process" ? "ARS process" : "programme"})`}
                </option>
              ))}
            </select>
          </label>
          {students.length > 0 ? (
            <details>
              <summary>Or pick students</summary>
              <div className="toggle-list">
                {students.map((student) => (
                  <label className="choice" key={student.id}>
                    <input name="studentId" type="checkbox" value={student.id} /> <span>{`${student.name} · ${student.email}`}</span>
                  </label>
                ))}
              </div>
            </details>
          ) : null}
          <span className="field__hint">Leave both empty to build it now and grant it later from the mock&apos;s own page.</span>
        </fieldset>

        <div className="form-bar">
          <SubmitButton pendingLabel="Building the mock…">Build the mock</SubmitButton>
          <PendingOverlay label="Building the mock…" />
        </div>
      </form>
    </section>
  );
}
