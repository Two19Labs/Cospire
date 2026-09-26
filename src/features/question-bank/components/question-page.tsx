import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton } from "@/shared/ui";

import { setQuestionArchivedAction } from "../actions/question-actions";
import {
  buildNewQuestionHref,
  buildQuestionHref,
  questionNotices,
  type QuestionBankBase,
  type QuestionNotice,
} from "../list-params";
import { formatQuestionId } from "../question-id";
import { questionTypeLabels, questionTypes, type QuestionType } from "../question-input";
import type { QuestionForEditing } from "../queries/get-question";
import type { QuestionSection } from "../queries/list-sections";
import { emptyQuestionValues, QuestionEditor } from "./question-editor";

// A new question, or an existing one opened for editing. The same editor
// either way; an existing DI set also lists its sub-questions under it.

export function QuestionPage({
  archiveFailed = false,
  base,
  newType,
  notice,
  parent,
  profile,
  question,
  sections,
  topics,
}: {
  archiveFailed?: boolean;
  base: QuestionBankBase;
  newType?: QuestionType;
  notice: QuestionNotice | null;
  parent: QuestionForEditing["parent"];
  profile: Profile;
  question: QuestionForEditing | null;
  sections: QuestionSection[];
  topics: string[];
}) {
  const type = question?.type ?? newType ?? "mcq";
  const title = question ? "Edit question" : "New question";

  return (
    <RoleShell
      back={
        parent
          ? { href: buildQuestionHref(base, parent.id), label: "Back to the DI set" }
          : { href: base, label: "Back to the question bank" }
      }
      description={
        question ? (
          <>
            Question ID <code>{formatQuestionId(question.id)}</code>. Quote it in a
            mock document to put this question in a mock. An archived question keeps
            its ID.
          </>
        ) : (
          "Keep the content clear and the answer key precise."
        )
      }
      heading={question ? undefined : "Create a question"}
      profile={profile}
      title={title}
    >
      {/*
        The four kinds of new question, as tabs. Each is the same route with a
        different `type`, exactly what the bank's links have always opened, so
        switching is a plain link and needs no JavaScript.
      */}
      {!question && !parent ? (
        <nav aria-label="Question type" className="tabs">
          {questionTypes.map((option) => (
            <Link
              aria-current={option === type ? "page" : undefined}
              className={`tabs__link${option === type ? " tabs__link--current" : ""}`}
              href={buildNewQuestionHref(base, option)}
              key={option}
            >
              {questionTypeLabels[option]}
            </Link>
          ))}
        </nav>
      ) : null}

      {notice ? <p className="notice notice--success">{questionNotices[notice]}</p> : null}
      {archiveFailed ? (
        <p className="notice notice--error" role="alert">
          That change was refused. Nothing changed.
        </p>
      ) : null}
      {question?.archived ? (
        <p className="notice notice--warn">
          This question is archived. It stays in past attempts but is not offered
          for new mocks.
        </p>
      ) : null}

      <QuestionEditor
        imageUrls={question?.imageUrls ?? {}}
        initialValues={question?.values ?? emptyQuestionValues}
        orgId={profile.orgId}
        parent={parent}
        questionId={question?.id ?? null}
        sections={sections}
        topics={topics}
        type={type}
      />

      {question && type === "di_stimulus" ? (
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>Sub-questions</h2>
              <p className="muted">These carry the marks. Each is answered against the passage above.</p>
            </div>
          </div>
          {question.children.length === 0 ? (
            <p className="panel-empty">None yet. Add the first below.</p>
          ) : (
            <ol className="report-list">
              {question.children.map((child) => (
                <li className="report-list__item" key={child.id}>
                  <Link href={buildQuestionHref(base, child.id)}>
                    {child.body.length > 110 ? `${child.body.slice(0, 107)}…` : child.body}
                  </Link>{" "}
                  <span className="muted">
                    {questionTypeLabels[child.type]} · {child.marks} marks
                    {child.archived ? " · archived" : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div className="toolbar">
            {(
              [
                ["mcq", "Add single correct"],
                ["mcq_multi", "Add multiple correct"],
                ["numerical", "Add typed answer (TITA)"],
              ] as const
            ).map(([childType, label]) => (
              <Link
                className="button button--secondary button--compact"
                href={buildNewQuestionHref(base, childType, question.id)}
                key={childType}
              >
                {label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {question ? (
        <section className="panel panel--narrow">
          <h2>{question.archived ? "Restore" : "Archive"}</h2>
          <p className="muted">
            {question.archived
              ? "Put this question back in the bank."
              : type === "di_stimulus"
                ? "Takes the whole set, with its sub-questions, out of the bank. Nothing is deleted."
                : "Takes the question out of the bank. Nothing is deleted, and past attempts keep it."}
          </p>
          <form action={setQuestionArchivedAction}>
            <input name="questionId" type="hidden" value={question.id} />
            <input name="archive" type="hidden" value={question.archived ? "0" : "1"} />
            <SubmitButton pendingLabel="Working…" variant={question.archived ? "secondary" : "danger"}>
              {question.archived ? "Restore" : "Archive"}
            </SubmitButton>
          </form>
        </section>
      ) : null}
    </RoleShell>
  );
}
