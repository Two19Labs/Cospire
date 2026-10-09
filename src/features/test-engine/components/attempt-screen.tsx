import Link from "next/link";

import type { Profile } from "@/features/auth/types";
import { SubmitButton } from "@/shared/ui";

import { nextSectionAction, submitAttemptAction } from "../actions/attempt-actions";
import { isAnswered } from "../answer";
import { nextSection, paperState, type PaperItem } from "../paper";
import type { AttemptView } from "../queries/attempt-view";
import { AutoSubmit } from "./auto-submit";
import { ExamCard, ExamFrame } from "./exam-frame";
import { ExamSitting, type Draft, type SittingProps } from "./exam-sitting";
import { FullscreenOnSubmit } from "./fullscreen";
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

// Sitting a mock, in the exam's own full-viewport frame rather than the
// application shell. The open section is handed whole to `ExamSitting`, which
// moves between its questions in the browser and saves in the background; every
// other state -- time up, the next section, a confirmation -- is a card drawn
// here on the server. All of it still works as plain form posts with scripting
// off: `?q=`, `?confirm=` and `?auto=` are read here as before.
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
  const frame = (children: React.ReactNode) => (
    <ExamFrame sub={profile.name} title={view.mock.title}>
      {children}
    </ExamFrame>
  );

  const submitForm = (label: string) => (
    <form action={submitAttemptAction} id="submit-form">
      <input name="attemptId" type="hidden" value={attemptId} />
      <SubmitButton pendingLabel="Submitting…">{label}</SubmitButton>
    </form>
  );

  if (state.kind === "over") {
    return frame(
      <ExamCard eyebrow="The clock has run out">
        {notice}
        <h2>Time is up</h2>
        <p>Your answers were saved as you went. Submit to see your result.</p>
        <Counts items={view.items} view={view} />
        {submitForm("Submit and see result")}
        {auto ? <AutoSubmit formId="submit-form" /> : null}
      </ExamCard>,
    );
  }

  if (state.kind === "enter") {
    const section = view.sections.find((entry) => entry.id === state.sectionId);
    return frame(
      <ExamCard eyebrow="Next section">
        {notice}
        <h2>Next: {section?.title}</h2>
        <p>
          {section?.durationMinutes ? `This section has ${section.durationMinutes} minutes. ` : ""}
          Its clock starts when you begin it. You cannot return to earlier sections.
        </p>
        <form action={nextSectionAction} id="enter-form">
          <input name="attemptId" type="hidden" value={attemptId} />
          <input name="sectionId" type="hidden" value={state.sectionId} />
          <FullscreenOnSubmit />
          <SubmitButton pendingLabel="Opening…">Begin {section?.title}</SubmitButton>
        </form>
        {auto ? <AutoSubmit formId="enter-form" /> : null}
      </ExamCard>,
    );
  }

  const visible = view.items.filter((item) => state.sectionId === null || item.sectionId === state.sectionId);
  const currentSection = view.sections.find((section) => section.id === state.sectionId) ?? null;
  const following = state.sectionId === null ? null : nextSection(view.sections, state.sectionId);

  // The no-JavaScript confirmation. With scripting on, the sitting draws its own
  // dialog and never comes here.
  if (confirm === "submit" || confirm === "leave") {
    const leaving = confirm === "leave" && following;
    return frame(
      <ExamCard eyebrow={leaving ? currentSection?.title : "Final step"}>
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
              <input name="sectionId" type="hidden" value={state.sectionId ?? ""} />
              <SubmitButton pendingLabel="Moving on…">Leave section</SubmitButton>
            </form>
          ) : (
            submitForm("Submit test")
          )}
          <Link className="button button--secondary" href={`/student/attempts/${attemptId}`}>
            Back to the questions
          </Link>
        </div>
      </ExamCard>,
    );
  }

  if (visible.length === 0) {
    return frame(
      <ExamCard>
        <h2>This section has no questions</h2>
        {following ? (
          <form action={nextSectionAction}>
            <input name="attemptId" type="hidden" value={attemptId} />
            <input name="sectionId" type="hidden" value={state.sectionId ?? ""} />
            <SubmitButton pendingLabel="Moving on…">Go to {following.title}</SubmitButton>
          </form>
        ) : (
          submitForm("Submit test")
        )}
      </ExamCard>,
    );
  }

  // The whole open section, in one response: bodies, options and images (signed
  // for ten minutes), never a key. Questions of sections not yet entered are
  // not readable at all (RLS), so nothing beyond this section is sent.
  const passages: SittingProps["passages"] = {};
  const saved: Record<number, Draft> = {};
  const questions: SittingProps["questions"] = [];
  for (const item of visible) {
    const question = view.questions.get(item.questionId);
    if (item.stimulusId !== null && !passages[item.stimulusId]) {
      const passage = view.questions.get(item.stimulusId);
      if (passage) passages[item.stimulusId] = { body: passage.body, imageUrls: passage.imageUrls };
    }
    const response = view.responses.get(item.questionId);
    if (response) saved[item.questionId] = { review: response.markedForReview, values: selectedValues(response.answer) };
    questions.push({
      body: question?.body ?? "This question could not be loaded.",
      id: item.questionId,
      imageUrls: question?.imageUrls ?? [],
      marks: question?.marks ?? 0,
      number: item.number,
      options: question?.options ?? [],
      passageId: item.stimulusId,
      type: question?.type ?? "mcq",
    });
  }

  const sequential = state.sectionId !== null;
  const doneIds = new Set(view.entered.filter((entry) => entry.submittedAt).map((entry) => entry.sectionId));
  const sections = [...view.sections]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => {
      const size = view.items.filter((item) => item.sectionId === section.id).length;
      return {
        id: section.id,
        state: !sequential
          ? ("open" as const)
          : section.id === state.sectionId
            ? ("current" as const)
            : doneIds.has(section.id) || view.entered.some((entry) => entry.sectionId === section.id)
              ? ("done" as const)
              : ("upcoming" as const),
        sub: section.durationMinutes ? `${section.durationMinutes} min` : `${size} Q`,
        title: section.title,
      };
    });

  return (
    <ExamSitting
      attemptId={attemptId}
      deadline={state.deadline.toISOString()}
      error={error ?? null}
      following={following?.title ?? null}
      // Keyed by section, so entering the next one starts a fresh sitting.
      key={state.sectionId ?? "paper"}
      name={profile.name}
      negative={{ marks: view.mock.negativeMarking, types: view.mock.negativeMarkingTypes }}
      passages={passages}
      phone={!view.attempt.proctored}
      proctored={view.mock.proctoringEnabled && view.attempt.proctored}
      questions={questions}
      saved={saved}
      sectionTitle={currentSection?.title ?? null}
      sections={sections}
      serverNow={now.toISOString()}
      startNumber={q ?? visible[0].number}
      title={view.mock.title}
      totalCount={view.items.length}
    />
  );
}
