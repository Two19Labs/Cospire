"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { QuestionType } from "@/features/question-bank/question-input";
import { SubmitButton } from "@/shared/ui";

import { nextSectionAction, saveAnswerAction, saveResponseAction, submitAttemptAction } from "../actions/attempt-actions";
import { formatMarks } from "../marks";
import { Countdown } from "./countdown";
import { ExamFrame } from "./exam-frame";
import { FullscreenButton } from "./fullscreen";
import { ProctorWatch } from "./proctor-watch";
import styles from "./exam.module.css";

export interface SittingQuestion {
  body: string;
  id: number;
  imageUrls: string[];
  marks: number;
  // 1-based across the whole paper, as a student counts.
  number: number;
  options: { id: string; text: string }[];
  passageId: number | null;
  type: QuestionType;
}

export interface Draft {
  review: boolean;
  values: string[];
}

export interface SittingProps {
  attemptId: number;
  deadline: string;
  error: string | null;
  // The next section's title, when this one can be left for it.
  following: string | null;
  name: string;
  negative: { marks: number; types: string[] };
  passages: Record<number, { body: string; imageUrls: string[] }>;
  // A phone attempt: unproctored for good (operating manual §1.5), and said so.
  phone: boolean;
  // Warn-and-log proctoring is on for this attempt.
  proctored: boolean;
  questions: SittingQuestion[];
  saved: Record<number, Draft>;
  sectionTitle: string | null;
  sections: { id: number; state: "current" | "done" | "open" | "upcoming"; sub: string; title: string }[];
  serverNow: string;
  startNumber: number;
  title: string;
  totalCount: number;
}

const errors: Record<string, string> = {
  closed: "That answer was not saved: the time for this section or paper has run out.",
  invalid: "That answer could not be read. Choose again.",
  submit: "The test could not be submitted. Try again.",
};

const typeLabels: Record<string, string> = {
  mcq: "Single correct",
  mcq_multi: "Multiple correct",
  numerical: "Typed answer",
};

type Status = "answered" | "both" | "notAnswered" | "review" | "unseen";

const answered = (draft: Draft | undefined) => Boolean(draft && draft.values.some((value) => value.trim() !== ""));

function statusOf(draft: Draft | undefined, visited: boolean): Status {
  const isAnswered = answered(draft);
  if (isAnswered && draft?.review) return "both";
  if (isAnswered) return "answered";
  if (draft?.review) return "review";
  return visited ? "notAnswered" : "unseen";
}

const legend: [Status, string][] = [
  ["answered", "Answered"],
  ["notAnswered", "Not answered"],
  ["unseen", "Not visited"],
  ["review", "Marked for review"],
  ["both", "Answered and marked (will be evaluated)"],
];

const cellClass: Record<Status, string> = {
  answered: styles.answered,
  both: `${styles.review} ${styles.both}`,
  notAnswered: styles.notAnswered,
  review: styles.review,
  unseen: "",
};

const same = (a: Draft | undefined, b: Draft | undefined) =>
  (a?.review ?? false) === (b?.review ?? false) && JSON.stringify(a?.values ?? []) === JSON.stringify(b?.values ?? []);

// One section of a paper, sat in the browser. The whole section arrives in one
// request, so moving between its questions is a change of state here -- no
// navigation, no skeleton -- and each answer is saved in the background as it
// changes, through `saveResponseAction`, where the database decides whether
// the clock still allows it.
//
// **It is still one form posting to `saveAnswerAction`.** Without JavaScript
// every button is a plain submit, exactly as before: save, then move. With it,
// `onSubmit` takes over the moves and leaves only the countdown's time-up post
// to go through as a form, so the answer on screen is saved inside the grace.
export function ExamSitting(props: SittingProps) {
  const { attemptId, questions } = props;
  const router = useRouter();
  const startIndex = Math.max(0, questions.findIndex((question) => question.number === props.startNumber));
  const [index, setIndex] = useState(startIndex);
  const [drafts, setDrafts] = useState<Record<number, Draft>>(props.saved);
  const [visited, setVisited] = useState<Set<number>>(
    () => new Set([...Object.keys(props.saved).map(Number), questions[startIndex]?.id].filter((id): id is number => id !== undefined)),
  );
  const [inFlight, setInFlight] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(props.error && errors[props.error] ? errors[props.error] : null);
  const [confirm, setConfirm] = useState<"leave" | "submit" | null>(null);

  // What the server is known to hold, what is waiting to go, and one queue so
  // two saves of one answer can never land out of order.
  const draftsRef = useRef(drafts);
  const serverRef = useRef<Record<number, Draft>>(props.saved);
  const timers = useRef(new Map<number, number>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const questionPane = useRef<HTMLDivElement>(null);

  const flush = useCallback(
    (questionId: number) => {
      const timer = timers.current.get(questionId);
      if (timer !== undefined) window.clearTimeout(timer);
      timers.current.delete(questionId);
      queue.current = queue.current.then(async () => {
        const draft = draftsRef.current[questionId];
        if (!draft || same(draft, serverRef.current[questionId])) return;
        setInFlight((count) => count + 1);
        try {
          const result = await saveResponseAction(attemptId, questionId, draft.values, draft.review);
          if (result.ok) {
            serverRef.current = { ...serverRef.current, [questionId]: draft };
            setFailed(null);
          } else if (result.reason === "invalid") {
            setFailed(errors.invalid);
          } else {
            // The clock or the section ran out: show what the server has.
            setFailed(errors.closed);
            router.refresh();
          }
        } catch {
          // Offline, or the server did not answer. Kept, and tried again.
          setFailed("Not saved yet -- check your connection. Trying again…");
          timers.current.set(questionId, window.setTimeout(() => flush(questionId), 3000));
        } finally {
          setInFlight((count) => count - 1);
        }
      });
      return queue.current;
    },
    [attemptId, router],
  );

  const flushAll = useCallback(() => {
    for (const id of Object.keys(draftsRef.current).map(Number)) void flush(id);
    return queue.current;
  }, [flush]);

  const update = (questionId: number, draft: Draft, delay: number) => {
    const next = { ...draftsRef.current, [questionId]: draft };
    draftsRef.current = next;
    setDrafts(next);
    const timer = timers.current.get(questionId);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.set(questionId, window.setTimeout(() => void flush(questionId), delay));
  };

  // Leaving the page -- a reload, a closed tab -- sends what is waiting.
  useEffect(() => {
    const onHide = () => void flushAll();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flushAll]);

  const question = questions[index];
  const go = (target: number) => {
    if (!question || target < 0 || target >= questions.length) return;
    void flush(question.id);
    const to = questions[target];
    setIndex(target);
    setVisited((seen) => new Set(seen).add(to.id));
    setNotice(null);
    // The address follows, so a reload opens on the same question.
    window.history.replaceState(null, "", `?q=${to.number}`);
    questionPane.current?.scrollTo({ top: 0 });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const name = submitter?.name ?? "goto";
    const value = submitter?.value ?? "";
    // Time is up: let the form post, so the answer on screen is saved inside
    // the grace and the server moves the paper on.
    if (name === "intent" && value === "timeup") return;
    event.preventDefault();
    if (!question) return;
    const current = draftsRef.current[question.id] ?? { review: false, values: [] };

    if (name === "goto") {
      const target = questions.findIndex((entry) => entry.number === Number(value));
      go(target >= 0 ? target : Math.min(index + 1, questions.length - 1));
    } else if (value === "clear") {
      update(question.id, { ...current, values: [] }, 0);
    } else if (value === "review-next") {
      update(question.id, { ...current, review: true }, 0);
      go(Math.min(index + 1, questions.length - 1));
    } else if (value === "submit" || value === "leave") {
      void flush(question.id);
      void flushAll();
      setConfirm(value);
    }
  };

  if (!question) return null;
  const draft = drafts[question.id] ?? { review: false, values: [] };
  const passage = question.passageId === null ? null : props.passages[question.passageId];
  const previous = questions[index - 1];
  const next = questions[index + 1];
  const statuses = questions.map((entry) => statusOf(drafts[entry.id], visited.has(entry.id)));
  const count = (wanted: Status[]) => statuses.filter((status) => wanted.includes(status)).length;
  const penalised = props.negative.marks > 0 && props.negative.types.includes(question.type);
  const pending = inFlight > 0 || timers.current.size > 0;

  const saveState = failed ? (
    <span className={`${styles.saveState} ${styles.saveError}`} role="status">
      {failed}
    </span>
  ) : (
    <span className={styles.saveState} role="status">
      {inFlight > 0 ? "Saving…" : "All answers saved"}
    </span>
  );

  return (
    <ExamFrame
      right={
        <>
          {saveState}
          {props.proctored ? <span className={styles.chip}>Proctored</span> : null}
          {props.phone ? <span className={`${styles.chip} ${styles.chipWarn}`}>Unproctored (phone)</span> : null}
          {props.proctored ? null : <FullscreenButton />}
        </>
      }
      sub={props.name}
      title={props.title}
    >
      <form action={saveAnswerAction} className={styles.sitting} id="question-form" onSubmit={onSubmit}>
        <input name="attemptId" type="hidden" value={attemptId} />
        <input name="questionId" type="hidden" value={question.id} />
        <input name="current" type="hidden" value={question.number} />
        <input name="next" type="hidden" value={next?.number ?? question.number} />

        <main className={styles.main}>
          <div className={styles.sectionBar}>
            <span className={styles.eyebrow}>Sections</span>
            {props.sections.map((section) => (
              <span
                aria-current={section.state === "current" ? "step" : undefined}
                className={`${styles.tab} ${section.state === "current" ? styles.tabCurrent : section.state === "done" ? styles.tabDone : ""}`}
                key={section.id}
              >
                {section.title}
                <span className={styles.tabSub}>{section.sub}</span>
              </span>
            ))}
            <span className={styles.spacer} />
            <div className={styles.timer}>
              <span className={styles.timerLabel}>Time left</span>
              <Countdown deadline={props.deadline} formId="question-form" serverNow={props.serverNow} submitterId="timeup-button" />
            </div>
          </div>

          <div className={styles.banners}>
            {props.proctored ? <ProctorWatch attemptId={attemptId} /> : null}
            {notice ? <p className="notice notice--error">{notice}</p> : null}
          </div>

          <div className={styles.qhead}>
            <h2>
              Question {question.number} of {props.totalCount}
            </h2>
            <span className={styles.tag}>{typeLabels[question.type] ?? question.type}</span>
            <span className={styles.spacer} />
            <label className={styles.reviewToggle}>
              <input
                checked={draft.review}
                name="review"
                onChange={(event) => update(question.id, { ...draft, review: event.target.checked }, 0)}
                type="checkbox"
              />
              Mark for review
            </label>
            <span className={`${styles.tag} ${styles.tagSage}`}>+{formatMarks(question.marks)} correct</span>
            <span className={`${styles.tag} ${penalised ? styles.tagRust : styles.tagGrey}`}>
              {penalised ? `−${formatMarks(props.negative.marks)} wrong` : "No negative"}
            </span>
          </div>

          <div className={styles.qarea}>
            {passage ? (
              <div className={styles.passage}>
                <p className={styles.body}>{passage.body}</p>
                {passage.imageUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
                  <img alt="" className={styles.image} key={url} src={url} />
                ))}
              </div>
            ) : null}
            <div className={styles.question} ref={questionPane}>
              <p className={styles.body}>{question.body}</p>
              {question.imageUrls.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
                <img alt="" className={styles.image} key={url} src={url} />
              ))}
              {question.type === "mcq_multi" ? (
                <span className={styles.hint}>Select all that apply. Marks are given only when every correct option is chosen.</span>
              ) : null}
              {question.type === "numerical" ? (
                <label className={styles.typed}>
                  <span className={styles.eyebrow}>Type your answer</span>
                  <input
                    autoComplete="off"
                    inputMode="decimal"
                    maxLength={50}
                    name="answer"
                    onChange={(event) => update(question.id, { ...draft, values: [event.target.value] }, 800)}
                    placeholder="Your answer"
                    value={draft.values[0] ?? ""}
                  />
                </label>
              ) : (
                <div className={styles.options}>
                  {question.options.map((option, position) => (
                    <label className={styles.option} key={option.id}>
                      <input
                        checked={draft.values.includes(option.id)}
                        name="answer"
                        onChange={(event) => {
                          const values =
                            question.type === "mcq_multi"
                              ? event.target.checked
                                ? [...draft.values, option.id]
                                : draft.values.filter((id) => id !== option.id)
                              : [option.id];
                          update(question.id, { ...draft, values }, 0);
                        }}
                        type={question.type === "mcq_multi" ? "checkbox" : "radio"}
                        value={option.id}
                      />
                      <span aria-hidden="true" className={styles.letter}>
                        {String.fromCharCode(65 + position)}
                      </span>
                      <span className={styles.body}>{option.text}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.actions}>
            {/* First in the form, so Enter in the answer box saves and moves on. */}
            <button className={`button button--primary ${styles.next}`} name="goto" type="submit" value={next?.number ?? question.number}>
              {next ? "Save and next" : "Save"}
            </button>
            <button className="button button--secondary" name="intent" type="submit" value="review-next">
              Mark for review and next
            </button>
            <button className="button button--secondary" name="intent" type="submit" value="clear">
              Clear response
            </button>
            <span className={styles.spacer} />
            {previous ? (
              <button className={`button button--secondary ${styles.prev}`} name="goto" type="submit" value={previous.number}>
                Previous
              </button>
            ) : null}
          </div>
        </main>

        <aside className={styles.side}>
          <div className={styles.who}>
            <span aria-hidden="true" className={styles.avatar}>
              {(props.name.trim().charAt(0) || "?").toUpperCase()}
            </span>
            <div>
              <strong>{props.name}</strong>
              <span className="muted">{props.sectionTitle ?? "All questions"}</span>
            </div>
          </div>
          <div className={styles.legend}>
            {legend.map(([status, label]) => (
              <div className={`${styles.legendItem} ${status === "both" ? styles.legendWide : ""}`} key={status}>
                <span className={`${styles.cell} ${cellClass[status]}`}>{count([status])}</span>
                {label}
              </div>
            ))}
          </div>
          <div className={styles.paletteHead}>
            <strong>{props.sectionTitle ?? "Questions"}</strong>
            <span>
              {count(["answered", "both"])} of {questions.length} answered
            </span>
          </div>
          <div className={styles.paletteScroll}>
            <div className={styles.palette}>
              {questions.map((entry, position) => (
                <button
                  aria-current={position === index ? "step" : undefined}
                  aria-label={`Question ${entry.number}: ${legend.find(([status]) => status === statuses[position])?.[1]}`}
                  className={`${styles.cell} ${cellClass[statuses[position]]} ${position === index ? styles.current : ""}`}
                  key={entry.id}
                  name="goto"
                  type="submit"
                  value={entry.number}
                >
                  {entry.number}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.sideFoot}>
            {props.following ? (
              <button className="button button--secondary" name="intent" type="submit" value="leave">
                Next section
              </button>
            ) : null}
            <button className={styles.submit} name="intent" type="submit" value="submit">
              Submit test
            </button>
          </div>
        </aside>
        {/* Last in the form, so it is never the default button Enter presses. */}
        <button hidden id="timeup-button" name="intent" tabIndex={-1} type="submit" value="timeup" />
      </form>

      {confirm ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <section className={styles.card}>
            <span className={styles.eyebrow}>{confirm === "leave" ? props.sectionTitle : "Final step"}</span>
            <h2 id="confirm-title">{confirm === "leave" ? `Leave ${props.sectionTitle}?` : "Submit the test?"}</h2>
            <p className="muted">
              {confirm === "leave"
                ? `You will move to ${props.following} and cannot come back to this section. Unused time does not carry over.`
                : "Once submitted, no answer can be changed."}
            </p>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <strong>{count(["answered", "both"])}</strong>answered
              </div>
              <div className={styles.stat}>
                <strong>{count(["notAnswered", "unseen", "review"])}</strong>not answered
              </div>
              <div className={styles.stat}>
                <strong>{count(["review", "both"])}</strong>marked for review
              </div>
            </div>
            {confirm === "submit" && props.following ? (
              <p className="muted">Questions in sections you have not reached count as not answered.</p>
            ) : null}
            {pending ? <p className="muted">Saving your last answer first…</p> : null}
            <div className="toolbar">
              <form action={confirm === "leave" ? nextSectionAction : submitAttemptAction}>
                <input name="attemptId" type="hidden" value={attemptId} />
                {confirm === "leave" ? <input name="sectionId" type="hidden" value={props.sections.find((s) => s.state === "current")?.id ?? ""} /> : null}
                {pending ? (
                  <button className="button button--primary" disabled type="button">
                    Saving…
                  </button>
                ) : (
                  <SubmitButton pendingLabel={confirm === "leave" ? "Moving on…" : "Submitting…"}>
                    {confirm === "leave" ? "Leave section" : "Submit test"}
                  </SubmitButton>
                )}
              </form>
              <button className="button button--secondary" onClick={() => setConfirm(null)} type="button">
                Back to the questions
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </ExamFrame>
  );
}
