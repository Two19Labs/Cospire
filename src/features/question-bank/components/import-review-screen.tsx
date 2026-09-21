import Link from "next/link";

import { SubmitButton } from "@/shared/ui";

import { approveImportAction, discardPendingAction, rejectImportAction } from "../actions/import-actions";
import { matchSection, stagedToFormValues } from "../import-review";
import { buildQuestionHref } from "../list-params";
import { questionTypeLabels } from "../question-input";
import type { ImportBatch, ImportRow } from "../queries/list-imports";
import type { QuestionSection } from "../queries/list-sections";
import { QuestionEditor } from "./question-editor";

// Reviewing one import: each question beside what the document said, opened in
// the ordinary editor, approved into the bank one at a time (Annexure A).

export const importReviewPageSize = 10;

const notices: Record<string, string> = {
  approved: "Approved into the bank.",
  failed: "That change was refused. Nothing changed.",
  rejected: "Rejected. It will not enter the bank.",
};

function SourceColumn({ row }: { row: ImportRow }) {
  const source = row.parsed?.source || (typeof row.raw.source === "string" ? row.raw.source : "");
  return (
    <div className="import-source">
      <p className="field__label">From the document</p>
      {source ? (
        <p className="question-text">{source}</p>
      ) : (
        <p className="muted">The model did not copy the original text. Compare against the document itself.</p>
      )}
      {row.parsed && row.parsed.notes.length > 0 ? (
        <ul className="muted">
          {row.parsed.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {row.status === "pending_review" && row.problems.length > 0 ? (
        <div className="form-error">
          <p>Fix before approving:</p>
          <ul>
            {row.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ImportReviewScreen({
  batch,
  batchId,
  notice,
  orgId,
  page,
  parentSets,
  sections,
  topics,
}: {
  batch: ImportBatch;
  batchId: string;
  notice: string | null;
  orgId: number;
  page: number;
  // Approved DI set passages in this batch, by their staged position.
  parentSets: Record<number, { body: string; id: number; sectionId: number }>;
  sections: QuestionSection[];
  topics: string[];
}) {
  const counts = { approved: 0, pending_review: 0, rejected: 0 };
  for (const row of batch.rows) counts[row.status] += 1;

  const pageCount = Math.max(1, Math.ceil(batch.rows.length / importReviewPageSize));
  const current = Math.min(page, pageCount);
  const rows = batch.rows.slice((current - 1) * importReviewPageSize, current * importReviewPageSize);

  return (
    <>
      <p>
        <Link href="/admin/questions/import">← Back to imports</Link>
      </p>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>{batch.sourceRef ?? "Untitled import"}</h2>
            <p className="muted">
              Imported {batch.createdAt.slice(0, 10)} · {counts.pending_review} to review · {counts.approved} approved ·{" "}
              {counts.rejected} rejected
            </p>
          </div>
          {counts.pending_review + counts.rejected > 0 ? (
            <form action={discardPendingAction}>
              <input name="batchId" type="hidden" value={batchId} />
              <SubmitButton compact pendingLabel="Discarding…" variant="danger">
                Discard what is not approved
              </SubmitButton>
            </form>
          ) : null}
        </div>
        {notice && notices[notice] ? <p className="muted">{notices[notice]}</p> : null}
        <p className="muted">
          Check each question against the document, correct anything the model got
          wrong, add any figure it flagged, then approve. Nothing enters the bank
          until you do. A DI set&apos;s passage is approved before its questions.
        </p>
      </section>

      {rows.map((row) => {
        const parsed = row.parsed;
        const heading = `${row.position + 1}. ${parsed ? questionTypeLabels[parsed.type] : "Unreadable entry"}${
          parsed?.parentPosition !== null && parsed?.parentPosition !== undefined
            ? ` · part of set ${parsed.parentPosition + 1}`
            : ""
        }`;
        const parentSet = parsed?.parentPosition != null ? parentSets[parsed.parentPosition] ?? null : null;
        const waitingForSet = parsed?.parentPosition != null && !parentSet;

        return (
          <section className="panel" id={`import-${row.id}`} key={row.id}>
            <div className="panel__header">
              <h3>{heading}</h3>
              {row.status === "approved" && row.questionId ? (
                <Link className="pill pill--active" href={buildQuestionHref("/admin/questions", row.questionId)}>
                  Approved — open in the bank
                </Link>
              ) : row.status === "rejected" ? (
                <span className="pill pill--disabled">Rejected</span>
              ) : null}
            </div>

            <div className="import-row">
              <SourceColumn row={row} />

              {row.status !== "pending_review" ? null : !parsed ? (
                <p className="muted">This entry is not a question this bank can hold. Reject it.</p>
              ) : waitingForSet ? (
                <p className="setup-notice">Approve the set&apos;s passage (question {parsed.parentPosition! + 1}) first.</p>
              ) : (
                <QuestionEditor
                  action={approveImportAction}
                  hidden={{ importId: String(row.id) }}
                  imageUrls={{}}
                  initialValues={stagedToFormValues(parsed, matchSection(parsed.sectionName, sections))}
                  orgId={orgId}
                  parent={parentSet}
                  questionId={null}
                  sections={sections}
                  submitLabel="Approve into the bank"
                  topics={topics}
                  type={parsed.type}
                />
              )}
            </div>

            {row.status === "pending_review" ? (
              <form action={rejectImportAction} className="form-actions">
                <input name="importId" type="hidden" value={row.id} />
                <input name="batchId" type="hidden" value={batchId} />
                <SubmitButton compact pendingLabel="Rejecting…" variant="secondary">
                  Reject
                </SubmitButton>
              </form>
            ) : null}
          </section>
        );
      })}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="pagination">
          {current > 1 ? (
            <Link href={`/admin/questions/import/${batchId}?page=${current - 1}`} rel="prev">
              Previous
            </Link>
          ) : (
            <span className="muted">Previous</span>
          )}
          <span className="muted">
            Page {current} of {pageCount}
          </span>
          {current < pageCount ? (
            <Link href={`/admin/questions/import/${batchId}?page=${current + 1}`} rel="next">
              Next
            </Link>
          ) : (
            <span className="muted">Next</span>
          )}
        </nav>
      ) : null}
    </>
  );
}
