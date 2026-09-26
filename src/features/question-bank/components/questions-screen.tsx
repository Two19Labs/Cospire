import Link from "next/link";

import { Icon } from "@/features/auth/components/icon";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import {
  SubmitButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/shared/ui";

import {
  buildNewQuestionHref,
  buildQuestionHref,
  buildQuestionsHref,
  questionNotices,
  questionsPageSize,
  type QuestionBankBase,
  type QuestionFilters,
  type QuestionNotice,
} from "../list-params";
import { formatQuestionId, formatQuestionIdList } from "../question-id";
import { difficulties, questionTypeLabels, questionTypes } from "../question-input";
import { questionIdCopyLimit, type QuestionListPage } from "../queries/list-questions";
import type { QuestionSection } from "../queries/list-sections";
import { CopyIds } from "./copy-ids";

// The admin page heading, shared with the loading skeleton.
export const questionBankHeading = "A stronger question bank.";

// Sage for easy, gold for medium, rust for hard, as the prototype tags them.
const difficultyTone: Record<string, string> = {
  easy: "tag--sage",
  hard: "tag--rust",
  medium: "tag--gold",
};

function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 110 ? `${flat.slice(0, 107)}…` : flat;
}

export function QuestionsScreen({
  base,
  filters,
  notice,
  profile,
  questionIds,
  questions,
  sections,
  topics,
}: {
  base: QuestionBankBase;
  filters: QuestionFilters;
  notice: QuestionNotice | null;
  profile: Profile;
  // Every ID behind the current filter, bounded, for the copy box.
  questionIds: { ids: number[]; truncated: boolean };
  questions: QuestionListPage;
  sections: QuestionSection[];
  topics: string[];
}) {
  const { page, pageCount, rows, total } = questions;
  const firstOnPage = total === 0 ? 0 : (page - 1) * questionsPageSize + 1;
  const lastOnPage = (page - 1) * questionsPageSize + rows.length;
  const sectionName = new Map(sections.map((section) => [section.id, section.name]));
  const filtered = Boolean(
    filters.search || filters.sectionId || filters.topic || filters.difficulty || filters.type || filters.archived,
  );

  return (
    <RoleShell
      actions={
        <>
          {profile.role === "admin" ? (
            <>
              <Link className="button button--secondary" href="/admin/questions/sections">
                Manage sections
              </Link>
              <Link className="button button--secondary" href="/admin/questions/import">
                Import questions
              </Link>
            </>
          ) : null}
          {sections.length > 0 ? (
            <Link className="button button--primary" href={buildNewQuestionHref(base, "mcq")}>
              <Icon name="plus" />
              New question
            </Link>
          ) : null}
        </>
      }
      description="Find, organise and refine the questions behind every assessment. Every question carries a section, topic, difficulty and marks."
      heading={profile.role === "admin" ? questionBankHeading : undefined}
      profile={profile}
      title="Question bank"
    >
      {sections.length === 0 ? (
        <section className="empty-state">
          <span aria-hidden="true" className="empty-state__mark">
            <Icon name="question" />
          </span>
          <h2>Add sections first</h2>
          <p>
            Every question belongs to a section, such as QA, LR or DI, and the
            analytics group scores by it.{" "}
            {profile.role === "admin"
              ? "Add the sections your mocks use, then come back here."
              : "An admin sets the list of sections; ask one to add them."}
          </p>
          {profile.role === "admin" ? (
            <Link className="button button--primary" href="/admin/questions/sections">
              Manage sections
            </Link>
          ) : null}
        </section>
      ) : null}

      {notice ? <p className="notice notice--success">{questionNotices[notice]}</p> : null}

      <section className="panel">
        <form action={base} className="toolbar toolbar--bleed" method="get">
          <label className="field field--inline" htmlFor="question-search">
            <span className="field__label">Search</span>
            <input
              className="input"
              defaultValue={filters.search}
              id="question-search"
              name="q"
              placeholder="Question text, or an ID such as Q00042"
              type="search"
            />
          </label>
          <label className="field" htmlFor="filter-section">
            <span className="field__label">Section</span>
            <select
              className="input input--compact"
              defaultValue={filters.sectionId ?? ""}
              id="filter-section"
              name="section"
            >
              <option value="">All</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor="filter-topic">
            <span className="field__label">Topic</span>
            <select className="input input--compact" defaultValue={filters.topic} id="filter-topic" name="topic">
              <option value="">All</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor="filter-difficulty">
            <span className="field__label">Difficulty</span>
            <select
              className="input input--compact"
              defaultValue={filters.difficulty ?? ""}
              id="filter-difficulty"
              name="difficulty"
            >
              <option value="">All</option>
              {difficulties.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {difficulty}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor="filter-type">
            <span className="field__label">Type</span>
            <select className="input input--compact" defaultValue={filters.type ?? ""} id="filter-type" name="type">
              <option value="">All</option>
              {questionTypes.map((type) => (
                <option key={type} value={type}>
                  {questionTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor="filter-status">
            <span className="field__label">Show</span>
            <select
              className="input input--compact"
              defaultValue={filters.archived ? "archived" : ""}
              id="filter-status"
              name="status"
            >
              <option value="">In use</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <SubmitButton pendingLabel="Working…" variant="secondary">
            Filter
          </SubmitButton>
          {filtered ? (
            <Link className="button button--ghost" href={base}>
              Clear
            </Link>
          ) : null}
        </form>

        {rows.length === 0 ? (
          <p className="panel-empty">
            {filtered
              ? "No question matches that filter. Try a different search or clear the filters."
              : "No questions yet. Write the first one, or import a paper."}
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{filters.archived ? "Archived question" : "Question"}</TableHeaderCell>
                <TableHeaderCell>Section &amp; topic</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Difficulty</TableHeaderCell>
                <TableHeaderCell>
                  <span className="visually-hidden">Action</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="table__primary">
                    <Link href={buildQuestionHref(base, row.id)}>{preview(row.body)}</Link>
                    <span className="cell-sub">
                      <code>{formatQuestionId(row.id)}</code>
                      {" · "}
                      {row.type === "di_stimulus"
                        ? `${row.childCount} sub-${row.childCount === 1 ? "question" : "questions"}`
                        : `${row.marks} ${Number(row.marks) === 1 ? "mark" : "marks"}`}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="tag">{sectionName.get(row.sectionId) ?? "—"}</span>
                    <span className="cell-sub">{row.topic}</span>
                  </TableCell>
                  <TableCell>{questionTypeLabels[row.type]}</TableCell>
                  <TableCell>
                    <span className={`tag ${difficultyTone[row.difficulty] ?? ""}`}>{row.difficulty}</span>
                  </TableCell>
                  <TableCell className="table__actions">
                    <Link className="title-link" href={buildQuestionHref(base, row.id)}>
                      Edit →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {total === 0 ? null : (
          <nav aria-label="Pagination" className="pagination">
            <span className="pagination__count">
              {total === 0 ? "No questions match." : `Showing ${firstOnPage}-${lastOnPage} of ${total} questions`}
            </span>
            {pageCount > 1 ? (
              <>
                {page > 1 ? (
                  <Link href={buildQuestionsHref(base, { ...filters, page: page - 1 })} rel="prev">
                    Previous
                  </Link>
                ) : (
                  <span>Previous</span>
        )}
              <span>
                Page {page} of {pageCount}
              </span>
              {page < pageCount ? (
                <Link href={buildQuestionsHref(base, { ...filters, page: page + 1 })} rel="next">
                  Next
                </Link>
              ) : (
                <span>Next</span>
              )}
            </>
          ) : null}
        </nav>
        )}
      </section>

      {questionIds.ids.length > 0 ? (
        <section className="panel">
          <CopyIds
            hint={`${questionIds.ids.length} ${
              questionIds.ids.length === 1 ? "question" : "questions"
            } match this filter${
              questionIds.truncated ? `, of which these are the first ${questionIdCopyLimit}` : ""
            }. A DI set counts once, as its passage, which is the ID that brings the whole set into a mock.`}
            ids={formatQuestionIdList(questionIds.ids)}
            label="Question IDs for this list, to paste into a mock document"
          />
        </section>
      ) : null}

      <p className="notice">
        Answer keys and solutions are part of the authoring view. DI sets keep
        their shared passage and sub-questions together.
      </p>
    </RoleShell>
  );
}
