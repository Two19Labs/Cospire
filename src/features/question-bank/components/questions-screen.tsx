import Link from "next/link";

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
    <RoleShell profile={profile} title="Question bank">
      {sections.length === 0 ? (
        <section className="panel">
          <h2>Add sections first</h2>
          <p className="muted">
            Every question belongs to a section, such as QA, LR or DI, and the
            analytics group scores by it.{" "}
            {profile.role === "admin"
              ? "Add the sections your mocks use, then come back here."
              : "An admin sets the list of sections; ask one to add them."}
          </p>
          {profile.role === "admin" ? (
            <p>
              <Link className="button button--primary" href="/admin/questions/sections">
                Manage sections
              </Link>
            </p>
          ) : null}
        </section>
      ) : (
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>New question</h2>
              <p className="muted">Every question needs a section, topic, difficulty and marks.</p>
            </div>
            {profile.role === "admin" ? (
              <div className="toolbar">
                <Link className="button button--primary button--compact" href="/admin/questions/import">
                  Import questions
                </Link>
                <Link className="button button--secondary button--compact" href="/admin/questions/sections">
                  Manage sections
                </Link>
              </div>
            ) : null}
          </div>
          <div className="toolbar">
            {questionTypes.map((type) => (
              <Link className="button button--secondary" href={buildNewQuestionHref(base, type)} key={type}>
                {questionTypeLabels[type]}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>{filters.archived ? "Archived questions" : "Questions"}</h2>
            <p className="muted">
              {total === 0 ? "No questions match." : `Showing ${firstOnPage}-${lastOnPage} of ${total}.`}
            </p>
          </div>
        </div>

        {notice ? <p className="muted">{questionNotices[notice]}</p> : null}

        <form action={base} className="toolbar" method="get">
          <label className="field field--inline" htmlFor="question-search">
            <span className="field__label">Search</span>
            <input className="input" defaultValue={filters.search} id="question-search" name="q" type="search" />
            <span className="field__hint">Words in the question, or a question ID such as Q00042.</span>
          </label>
          <label className="field field--inline" htmlFor="filter-section">
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
          <label className="field field--inline" htmlFor="filter-topic">
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
          <label className="field field--inline" htmlFor="filter-difficulty">
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
          <label className="field field--inline" htmlFor="filter-type">
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
          <label className="field field--inline" htmlFor="filter-status">
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
            <Link className="muted" href={base}>
              Clear
            </Link>
          ) : null}
        </form>

        {rows.length === 0 ? (
          <p className="muted">{filtered ? "No question matches that filter." : "No questions yet."}</p>
        ) : (
          <div className="table-scroll">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>ID</TableHeaderCell>
                  <TableHeaderCell>Question</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Section</TableHeaderCell>
                  <TableHeaderCell>Topic</TableHeaderCell>
                  <TableHeaderCell>Difficulty</TableHeaderCell>
                  <TableHeaderCell>Marks</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <code>{formatQuestionId(row.id)}</code>
                    </TableCell>
                    <TableCell>
                      <Link href={buildQuestionHref(base, row.id)}>{preview(row.body)}</Link>
                    </TableCell>
                    <TableCell>
                      {questionTypeLabels[row.type]}
                      {row.type === "di_stimulus" ? (
                        <span className="muted">
                          {" "}
                          · {row.childCount} {row.childCount === 1 ? "question" : "questions"}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{sectionName.get(row.sectionId) ?? "—"}</TableCell>
                    <TableCell>{row.topic}</TableCell>
                    <TableCell>{row.difficulty}</TableCell>
                    <TableCell>{row.type === "di_stimulus" ? "—" : row.marks}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {pageCount > 1 ? (
          <nav aria-label="Pagination" className="pagination">
            {page > 1 ? (
              <Link href={buildQuestionsHref(base, { ...filters, page: page - 1 })} rel="prev">
                Previous
              </Link>
            ) : (
              <span className="muted">Previous</span>
            )}
            <span className="muted">
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={buildQuestionsHref(base, { ...filters, page: page + 1 })} rel="next">
                Next
              </Link>
            ) : (
              <span className="muted">Next</span>
            )}
          </nav>
        ) : null}

        {questionIds.ids.length > 0 ? (
          <CopyIds
            hint={`${questionIds.ids.length} ${
              questionIds.ids.length === 1 ? "question" : "questions"
            } match this filter${
              questionIds.truncated ? `, of which these are the first ${questionIdCopyLimit}` : ""
            }. A DI set counts once, as its passage, which is the ID that brings the whole set into a mock.`}
            ids={formatQuestionIdList(questionIds.ids)}
            label="Question IDs for this list, to paste into a mock document"
          />
        ) : null}
      </section>
    </RoleShell>
  );
}
