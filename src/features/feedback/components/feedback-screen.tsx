import Image from "next/image";

import { ActionBoundary, SubmitButton } from "@/shared/ui";

import { answerThoughtAction } from "../actions";
import { statusLabels, statuses, type FeedbackMode, type FeedbackStatus } from "../feedback";
import type { Thought } from "../store";
import styles from "./feedback.module.css";
import { ThoughtForm } from "./thought-form";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const statusTag: Record<FeedbackStatus, string> = {
  discussing: "tag tag--gold",
  done: "tag tag--sage",
  new: "tag tag--ink",
  out_of_scope: "tag",
  planned: "tag tag--gold",
};

// One page, two links. The Client's link logs thoughts and shows every thought
// with its status and answer; the owner's link answers them.
export function FeedbackScreen({ code, mode, notice, thoughts }: { code: string; mode: FeedbackMode; notice?: string; thoughts: Thought[] }) {
  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <Image alt="Cospire" className={styles.logo} height={57} priority src="/cospire-wordmark.png" width={158} />
        <h1>{mode === "owner" ? "Feedback: all thoughts" : "Share a thought"}</h1>
        <p className="muted">
          {mode === "owner"
            ? "Answer each thought and set where it stands. The Client sees the status and your answer."
            : "Anything about the platform: a change, something new, something that is not working. One thought per entry."}
        </p>
      </header>

      {mode === "client" ? (
        <section className="panel">
          <ThoughtForm code={code} />
        </section>
      ) : null}
      {notice === "saved" ? <p className="notice notice--success">Saved.</p> : null}
      {notice === "failed" ? <p className="notice notice--error">That could not be saved. Try again.</p> : null}

      <ActionBoundary>
        {thoughts.length === 0 ? <p className="muted">Nothing has been logged yet.</p> : null}
        {thoughts.map((thought) => (
          <article className={`panel ${styles.thought}`} id={`thought-${thought.id}`} key={thought.id}>
            <div className="tag-row">
              {thought.urgent ? <span className="tag tag--rust">Urgent</span> : null}
              <span className={statusTag[thought.status]}>{statusLabels[thought.status]}</span>
            </div>
            <h2>{thought.title}</h2>
            <p className="muted">
              {thought.authorName ?? "No name given"} · {dateFormat.format(new Date(thought.createdAt))}
            </p>
            <p className={styles.text}>{thought.body}</p>
            {thought.screenshots.length ? (
              <div className={styles.shots}>
                {thought.screenshots.map((url, index) => (
                  <a href={url} key={url} rel="noreferrer" target="_blank">
                    {/* A signed, short-lived URL: next/image cannot optimise it. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={`Screenshot ${index + 1}`} loading="lazy" src={url} />
                  </a>
                ))}
              </div>
            ) : null}
            {mode === "owner" ? (
              <form action={answerThoughtAction} className="stack-form stack-form--wide">
                <input name="code" type="hidden" value={code} />
                <input name="id" type="hidden" value={thought.id} />
                <label className="field" htmlFor={`status-${thought.id}`}>
                  <span className="field__label">Status</span>
                  <select className="input" defaultValue={thought.status} id={`status-${thought.id}`} name="status">
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" htmlFor={`reply-${thought.id}`}>
                  <span className="field__label">Your answer</span>
                  <textarea className="input" defaultValue={thought.reply ?? ""} id={`reply-${thought.id}`} maxLength={5000} name="reply" rows={3} />
                </label>
                <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
              </form>
            ) : thought.reply ? (
              <div className={styles.reply}>
                <span className="field__label">Answer{thought.repliedAt ? ` · ${dateFormat.format(new Date(thought.repliedAt))}` : ""}</span>
                <p className={styles.text}>{thought.reply}</p>
              </div>
            ) : null}
          </article>
        ))}
      </ActionBoundary>
    </main>
  );
}
