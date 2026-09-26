import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/shared/ui";

import { isAnswered } from "../answer";
import type { AttemptView, PaperQuestion } from "../queries/attempt-view";
import type { QuestionKey } from "../queries/attempt-keys";
import styles from "./exam.module.css";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

function marks(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}

// An answer or a key, as the student would read it: option text for a choice,
// the typed text or accepted forms for a typed answer.
function describe(question: PaperQuestion | undefined, value: unknown): string {
  if (!value || typeof value !== "object") return "—";
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.options)) {
    const text = record.options.map((id) => {
      const index = question?.options.findIndex((option) => option.id === id) ?? -1;
      return index >= 0 ? `${String.fromCharCode(65 + index)}. ${question?.options[index].text}` : String(id);
    });
    return text.length ? text.join("; ") : "—";
  }
  if (typeof record.value === "string") return record.value || "—";
  if (Array.isArray(record.accepted)) return record.accepted.join(" or ");
  return "—";
}

export function ResultScreen({ keys, profile, view }: { keys: Map<number, QuestionKey>; profile: Profile; view: AttemptView }) {
  const { attempt } = view;
  const rows = view.items.map((item) => ({ item, response: view.responses.get(item.questionId) }));
  const answered = rows.filter((row) => isAnswered(row.response?.answer ?? null));
  const correct = answered.filter((row) => row.response?.isCorrect).length;
  const total = view.items.reduce((sum, item) => sum + (view.questions.get(item.questionId)?.marks ?? 0), 0);

  return (
    <RoleShell profile={profile} title={view.mock.title}>
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Your result</h2>
            <p className="muted">
              Submitted {attempt.submittedAt ? dateFormat.format(new Date(attempt.submittedAt)) : ""}
              {attempt.submittedBy === "timer" ? " when the time ran out" : ""}
            </p>
          </div>
        </div>
        {attempt.proctored ? null : (
          <p className="notice">This attempt was taken on a phone and is recorded as unproctored.</p>
        )}
        <div className={styles.stats}>
          <div className={styles.stat}>
            <strong>{attempt.score === null ? "—" : marks(attempt.score)}</strong>score out of {marks(total)}
          </div>
          <div className={styles.stat}><strong>{correct}</strong>correct</div>
          <div className={styles.stat}><strong>{answered.length - correct}</strong>wrong</div>
          <div className={styles.stat}><strong>{view.items.length - answered.length}</strong>not answered</div>
        </div>
        {attempt.score === null ? <p className="muted">Your score is being worked out. Refresh in a moment.</p> : null}
      </section>

      {view.sections.length > 1 ? (
        <section className="panel">
          <h2>By section</h2>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Section</TableHeaderCell>
                <TableHeaderCell>Correct</TableHeaderCell>
                <TableHeaderCell>Wrong</TableHeaderCell>
                <TableHeaderCell>Not answered</TableHeaderCell>
                <TableHeaderCell>Marks</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...view.sections].sort((a, b) => a.sortOrder - b.sortOrder).map((section) => {
                const inSection = rows.filter((row) => row.item.sectionId === section.id);
                const tried = inSection.filter((row) => isAnswered(row.response?.answer ?? null));
                const right = tried.filter((row) => row.response?.isCorrect).length;
                const sum = inSection.reduce((value, row) => value + (row.response?.marksAwarded ?? 0), 0);
                return (
                  <TableRow key={section.id}>
                    <TableCell>{section.title}</TableCell>
                    <TableCell>{right}</TableCell>
                    <TableCell>{tried.length - right}</TableCell>
                    <TableCell>{inSection.length - tried.length}</TableCell>
                    <TableCell>{marks(sum)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      ) : null}

      <section className="panel">
        <h2>Question by question</h2>
        {rows.map(({ item, response }) => {
          const question = view.questions.get(item.questionId);
          const key = keys.get(item.questionId);
          const tried = isAnswered(response?.answer ?? null);
          return (
            <article className={styles.stat} key={item.questionId} style={{ marginBottom: "0.75rem" }}>
              <p>
                <strong>Question {item.number}</strong>{" "}
                <span className={tried ? (response?.isCorrect ? styles.correct : styles.wrong) : "muted"}>
                  {tried ? (response?.isCorrect ? "Correct" : "Wrong") : "Not answered"}
                  {response?.marksAwarded != null ? ` · ${response.marksAwarded > 0 ? "+" : ""}${marks(response.marksAwarded)}` : ""}
                </span>
              </p>
              {question ? <p className={styles.body}>{question.body}</p> : null}
              <p>Your answer: {tried ? describe(question, response?.answer) : "—"}</p>
              <p>Correct answer: {key ? describe(question, key.correctAnswer) : "—"}</p>
              {key?.solution ? <p className={styles.body}><em>Solution:</em> {key.solution}</p> : null}
            </article>
          );
        })}
      </section>

      <div className="toolbar">
        <Link className="button button--secondary" href={`/student/mocks/${attempt.mockId}`}>
          Back to the mock
        </Link>
      </div>
    </RoleShell>
  );
}
