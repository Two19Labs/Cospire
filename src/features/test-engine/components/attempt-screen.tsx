import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton } from "@/shared/ui";

import { nextSectionAction, saveAnswerAction, submitAttemptAction } from "../actions/attempt-actions";
import { isAnswered } from "../answer";
import { nextSection, paperState, type PaperItem } from "../paper";
import type { AttemptView } from "../queries/attempt-view";
import { AutoSubmit } from "./auto-submit";
import { Countdown } from "./countdown";
import { ProctorWatch } from "./proctor-watch";
import styles from "./exam.module.css";

const errors: Record<string, string> = {
  closed: "That answer was not saved: the time for this section or paper has run out.",
  invalid: "That answer could not be read. Choose again.",
  submit: "The test could not be submitted. Try again.",
};

function selectedValues(answer: unknown): string[] {
  if (!answer || typeof answer !== "object") return [];
  const record = answer as Record<string, unknown>;
  if (Array.isArray(record.options)) return record.options.filter((value): value is string => typeof value === "string");
  return typeof record.value === "string" ? [record.value] : [];
}

function Counts({ items, view }: { items: PaperItem[]; view: AttemptView }) {
  const answered = items.filter((item) => isAnswered(view.responses.get(item.questionId)?.answer ?? null)).length;
  const review = items.filter((item) => view.responses.get(item.questionId)?.markedForReview).length;
  return (
    <div className={styles.stats}>
      <div className={styles.stat}><strong>{answered}</strong>answered</div>
      <div className={styles.stat}><strong>{items.length - answered}</strong>not answered</div>
      <div className={styles.stat}><strong>{review}</strong>marked for review</div>
    </div>
  );
}

// Sitting a mock. A Server Component throughout: every move is a form post that
// saves first, so the paper works with scripting off. The only client pieces
// are the countdown and the carry-on after time runs out.
export function AttemptScreen({
  auto,
  confirm,
  error,
  profile,
  q,
  view,
}: {
  auto: boolean;
  confirm?: string;
  error?: string;
  profile: Profile;
  q: number | null;
  view: AttemptView;
}) {
  const now = new Date();
  const state = paperState(view.sections, view.entered, new Date(view.attempt.startedAt), view.mock.durationMinutes, now);
  const attemptId = view.attempt.id;
  const notice = error && errors[error] ? <p className="notice notice--error">{errors[error]}</p> : null;

  const submitForm = (label: string) => (
    <form action={submitAttemptAction} id="submit-form">
      <input name="attemptId" type="hidden" value={attemptId} />
      <SubmitButton pendingLabel="Submitting…">{label}</SubmitButton>
    </form>
  );

  if (state.kind === "over") {
    return (
      <RoleShell profile={profile} title={view.mock.title}>
        {notice}
        <section className="panel">
          <h2>Time is up</h2>
          <p>Your answers were saved as you went. Submit to see your result.</p>
          <Counts items={view.items} view={view} />
          {submitForm("Submit and see result")}
          {auto ? <AutoSubmit formId="submit-form" /> : null}
        </section>
      </RoleShell>
    );
  }

  if (state.kind === "enter") {
    const section = view.sections.find((entry) => entry.id === state.sectionId);
    return (
      <RoleShell profile={profile} title={view.mock.title}>
        {notice}
        <section className="panel">
          <h2>Next: {section?.title}</h2>
          <p>
            {section?.durationMinutes ? `This section has ${section.durationMinutes} minutes. ` : ""}
            Its clock starts when you begin it. You cannot return to earlier sections.
          </p>
          <form action={nextSectionAction} id="enter-form">
            <input name="attemptId" type="hidden" value={attemptId} />
            <SubmitButton pendingLabel="Opening…">Begin {section?.title}</SubmitButton>
          </form>
          {auto ? <AutoSubmit formId="enter-form" /> : null}
        </section>
      </RoleShell>
    );
  }

  const visible = view.items.filter((item) => state.sectionId === null || item.sectionId === state.sectionId);
  const currentSection = view.sections.find((section) => section.id === state.sectionId) ?? null;
  const following = state.sectionId === null ? null : nextSection(view.sections, state.sectionId);

  if (confirm === "submit" || confirm === "leave") {
    const leaving = confirm === "leave" && following;
    return (
      <RoleShell profile={profile} title={view.mock.title}>
        <section className="panel">
          <h2>{leaving ? `Leave ${currentSection?.title}?` : "Submit the test?"}</h2>
          <p>
            {leaving
              ? `You will move to ${following.title} and cannot come back to this section.`
              : "Once submitted, no answer can be changed."}
          </p>
          <Counts items={leaving ? visible : view.items} view={view} />
          <div className="toolbar">
            {leaving ? (
              <form action={nextSectionAction}>
                <input name="attemptId" type="hidden" value={attemptId} />
                <SubmitButton pendingLabel="Moving on…">Leave section</SubmitButton>
              </form>
            ) : (
              submitForm("Submit test")
            )}
            <Link className="button button--secondary" href={`/student/attempts/${attemptId}`}>
              Back to the questions
            </Link>
          </div>
        </section>
      </RoleShell>
    );
  }

  const item = visible.find((entry) => entry.number === q) ?? visible[0];
  if (!item) {
    return (
      <RoleShell profile={profile} title={view.mock.title}>
        <section className="panel">
          <h2>This section has no questions</h2>
          {following ? (
            <form action={nextSectionAction}>
              <input name="attemptId" type="hidden" value={attemptId} />
              <SubmitButton pendingLabel="Moving on…">Go to {following.title}</SubmitButton>
            </form>
          ) : (
            submitForm("Submit test")
          )}
        </section>
      </RoleShell>
    );
  }

  const question = view.questions.get(item.questionId);
  const passage = item.stimulusId === null ? null : view.questions.get(item.stimulusId);
  const response = view.responses.get(item.questionId);
  const chosen = selectedValues(response?.answer ?? null);
  const index = visible.indexOf(item);
  const previous = visible[index - 1];
  const next = visible[index + 1];

  return (
    <RoleShell profile={profile} title={view.mock.title}>
      {notice}
      {view.mock.proctoringEnabled && view.attempt.proctored ? <ProctorWatch attemptId={attemptId} /> : null}
      <form action={saveAnswerAction} id="question-form">
        <input name="attemptId" type="hidden" value={attemptId} />
        <input name="questionId" type="hidden" value={item.questionId} />
        <input name="current" type="hidden" value={item.number} />
        <button hidden id="timeup-button" name="intent" tabIndex={-1} type="submit" value="timeup" />

        <div className={styles.bar}>
          <strong>
            {currentSection ? `${currentSection.title} · ` : ""}Question {item.number} of {view.items.length}
          </strong>
          <Countdown deadline={state.deadline.toISOString()} formId="question-form" serverNow={now.toISOString()} submitterId="timeup-button" />
        </div>

        <div className={styles.layout}>
          <section className="panel">
            {passage ? (
              <div className={styles.passage}>
                <p className={styles.body}>{passage.body}</p>
                {passage.imageUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
                  <img alt="" className={styles.image} key={url} src={url} />
                ))}
              </div>
            ) : null}
            {question ? (
              <>
                <p className={styles.body}>{question.body}</p>
                {question.imageUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
                  <img alt="" className={styles.image} key={url} src={url} />
                ))}
                <p className="muted">
                  {question.marks} mark{question.marks === 1 ? "" : "s"}
                  {question.type === "mcq_multi" ? " · choose every correct option" : ""}
                </p>
                {question.type === "numerical" ? (
                  <label className="field">
                    <span className="field__label">Your answer</span>
                    <input autoComplete="off" className="input" defaultValue={chosen[0] ?? ""} inputMode="decimal" maxLength={50} name="answer" />
                  </label>
                ) : (
                  <div className={styles.options}>
                    {question.options.map((option) => (
                      <label className={styles.option} key={option.id}>
                        <input
                          defaultChecked={chosen.includes(option.id)}
                          name="answer"
                          type={question.type === "mcq_multi" ? "checkbox" : "radio"}
                          value={option.id}
                        />
                        <span className={styles.body}>{option.text}</span>
                      </label>
                    ))}
                  </div>
                )}
                <label className="choice">
                  <input defaultChecked={response?.markedForReview ?? false} name="review" type="checkbox" /> Mark for review
                </label>
              </>
            ) : (
              <p className="notice notice--error">This question could not be loaded.</p>
            )}

            <div className="toolbar">
              {/* First in the form, so Enter in the answer box saves and moves on. */}
              <button className="button button--primary" name="goto" type="submit" value={next?.number ?? item.number}>
                {next ? "Save and next" : "Save"}
              </button>
              {previous ? (
                <button className="button button--secondary" name="goto" type="submit" value={previous.number}>
                  Previous
                </button>
              ) : null}
              <button className="button button--secondary" name="intent" type="submit" value="clear">
                Clear answer
              </button>
            </div>
          </section>

          <aside className="panel">
            <h2>{currentSection ? currentSection.title : "Questions"}</h2>
            <div className={styles.palette}>
              {visible.map((entry) => {
                const saved = view.responses.get(entry.questionId);
                const classes = [
                  styles.cell,
                  isAnswered(saved?.answer ?? null) ? styles.answered : "",
                  saved?.markedForReview ? styles.review : "",
                  entry === item ? styles.current : "",
                ].join(" ");
                return (
                  <button aria-current={entry === item ? "step" : undefined} className={classes} key={entry.questionId} name="goto" type="submit" value={entry.number}>
                    {entry.number}
                  </button>
                );
              })}
            </div>
            <div className={styles.legend}>
              <span>Filled: answered</span>
              <span>Gold ring: for review</span>
            </div>
            <div className="toolbar">
              {following ? (
                <button className="button button--secondary" name="intent" type="submit" value="leave">
                  Next section
                </button>
              ) : null}
              <button className="button button--danger" name="intent" type="submit" value="submit">
                Submit test
              </button>
            </div>
          </aside>
        </div>
      </form>
    </RoleShell>
  );
}
