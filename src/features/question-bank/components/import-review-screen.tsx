import Link from "next/link";

import { SubmitButton } from "@/shared/ui";

import { approveAllCleanAction, approveImportAction, discardPendingAction, linkImportAction, rejectImportAction } from "../actions/import-actions";
import type { Verdict } from "../duplicates";
import { matchSection, reviewProblems, stagedToFormValues } from "../import-review";
import { buildQuestionHref } from "../list-params";
import { formatQuestionId, formatQuestionIdList } from "../question-id";
import { questionTypeLabels } from "../question-input";
import type { ImportBatch, ImportRow } from "../queries/list-imports";
import type { QuestionSection } from "../queries/list-sections";
import { CopyIds } from "./copy-ids";
import { QuestionEditor } from "./question-editor";

// Reviewing one import: each question beside what the document said, opened in
// the ordinary editor, approved into the bank one at a time (Annexure A).

export const importReviewPageSize = 10;

const notices: Record<string, string> = {
  approved: "Approved into the bank.",
  bulk: "Every question that needed no decision is approved. What is left needs you.",
  "bulk-none": "Nothing could be approved without a decision. Each question left needs you.",
  corrected: "Saved as a corrected version of the existing question. Past attempts that answered it are rescored if the key changed.",
  failed: "That change was refused. Nothing changed.",
  linked: "Linked to the existing question. Nothing was copied.",
  "section-created": "Section created. Questions naming it can now be approved.",
  rejected: "Rejected. It will not enter the bank.",
};

function SourceColumn({ problems, row }: { problems: string[]; row: ImportRow }) {
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
      {row.status === "pending_review" && problems.length > 0 ? (
        <div className="form-error">
          <p>Fix before approving:</p>
          <ul>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}…` : flat;
}

// What still stops a pending row being approved, judged against the sections
// that exist now rather than as stored at staging: a section created since
// (D14) settles "choose a section". A row already held needs only linking.
function liveProblems(row: ImportRow, sections: QuestionSection[], orgId: number): string[] {
  if (!row.parsed) return row.problems;
  const kind = row.parsed.duplicate?.kind;
  if (kind === "same" || kind === "repeat") return [];
  return reviewProblems(row.parsed, matchSection(row.parsed.sectionName, sections), orgId);
}

// Whether a pending row needs a person. Mirrors approveAllCleanAction: a flagged
// match, a problem to fix, or an unreadable entry always does.
function isClean(row: ImportRow, sections: QuestionSection[], orgId: number): boolean {
  return (
    row.status === "pending_review" &&
    row.parsed !== null &&
    row.parsed.duplicate?.kind !== "possible" &&
    liveProblems(row, sections, orgId).length === 0
  );
}

function LinkButton({ batchId, importId, label, questionId }: { batchId: string; importId: number; label: string; questionId: number }) {
  return (
    <form action={linkImportAction}>
      <input name="importId" type="hidden" value={importId} />
      <input name="batchId" type="hidden" value={batchId} />
      <input name="questionId" type="hidden" value={questionId} />
      <SubmitButton compact pendingLabel="Linking…" variant="secondary">
        {label}
      </SubmitButton>
    </form>
  );
}

// What the bank already holds of this question (D22-D24).
function DuplicateNotice({
  bankTexts,
  batchId,
  questionIdAt,
  row,
  verdict,
}: {
  bankTexts: Record<number, string>;
  batchId: string;
  questionIdAt: (position: number) => number | null;
  row: ImportRow;
  verdict: Verdict;
}) {
  if (verdict.kind === "new") return verdict.note ? <p className="notice">{verdict.note}</p> : null;

  if (verdict.kind === "same") {
    return (
      <div className="notice notice--success">
        <p>
          <strong>Already in the bank as {formatQuestionId(verdict.questionId)}.</strong> The text, options, answer
          and pictures are the same, so it is linked rather than copied.
        </p>
        <LinkButton batchId={batchId} importId={row.id} label={`Link to ${formatQuestionId(verdict.questionId)}`} questionId={verdict.questionId} />
      </div>
    );
  }

  if (verdict.kind === "repeat") {
    const earlier = questionIdAt(verdict.position);
    return (
      <div className="notice notice--success">
        <p>
          <strong>Repeats question {verdict.position + 1} of this paper.</strong> It becomes whatever that one
          becomes.
        </p>
        {earlier === null ? (
          <p className="muted">Decide question {verdict.position + 1} first.</p>
        ) : (
          <LinkButton batchId={batchId} importId={row.id} label={`Link to ${formatQuestionId(earlier)}`} questionId={earlier} />
        )}
      </div>
    );
  }

  const isSubQuestion = row.parsed?.parentPosition !== null && row.parsed?.parentPosition !== undefined;
  return (
    <div className="notice notice--warn">
      <p>
        <strong>Possibly the same as a question you already have.</strong> Decide: link it as the same question,
        save it as a corrected version of that one, or approve it as a different question.
      </p>
      <ul>
        {verdict.candidates.map((candidate) => {
          const percent = `${Math.round(candidate.similarity * 100)}% similar text${candidate.sameText ? ", identical wording" : ""}`;
          if (candidate.source === "paper") {
            const earlier = questionIdAt(candidate.position);
            return (
              <li key={`paper-${candidate.position}`}>
                Question {candidate.position + 1} of this paper · {percent}
                {earlier !== null && !isSubQuestion ? (
                  <LinkButton batchId={batchId} importId={row.id} label={`Same question — link to ${formatQuestionId(earlier)}`} questionId={earlier} />
                ) : null}
              </li>
            );
          }
          return (
            <li key={`bank-${candidate.questionId}`}>
              {formatQuestionId(candidate.questionId)} · {percent}
              {bankTexts[candidate.questionId] ? <p className="question-text">{excerpt(bankTexts[candidate.questionId])}</p> : null}
              {isSubQuestion ? null : (
                <LinkButton
                  batchId={batchId}
                  importId={row.id}
                  label={`Same question — link to ${formatQuestionId(candidate.questionId)}`}
                  questionId={candidate.questionId}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ImportReviewScreen({
  bankTexts,
  batch,
  batchId,
  imageUrls,
  notice,
  orgId,
  page,
  parentSets,
  sections,
  topics,
}: {
  // Texts of the bank questions pending rows may match, by question id.
  bankTexts: Record<number, string>;
  batch: ImportBatch;
  batchId: string;
  // Signed URLs for the figures taken out of a Word upload, by object path.
  imageUrls: Record<string, string>;
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

  // The IDs this import created, in the order the paper listed them, ready to
  // paste into a mock document. A DI set appears once, as its passage: that is
  // the ID that brings the whole set into a mock, and a sub-question's own ID is
  // refused there on purpose.
  const createdIds = [...batch.rows]
    .filter((row) => row.status === "approved" && row.questionId !== null && (row.parsed?.parentPosition ?? null) === null)
    .sort((a, b) => a.position - b.position)
    .map((row) => row.questionId as number);

  const cleanCount = batch.rows.filter((row) => isClean(row, sections, orgId)).length;
  const questionIdAt = (position: number) =>
    batch.rows.find((row) => row.position === position && row.status === "approved")?.questionId ?? null;

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
          {cleanCount > 0 ? (
            <form action={approveAllCleanAction}>
              <input name="batchId" type="hidden" value={batchId} />
              <SubmitButton pendingLabel="Approving…">{`Approve all clean (${cleanCount})`}</SubmitButton>
            </form>
          ) : null}
          {counts.pending_review + counts.rejected > 0 ? (
            <form action={discardPendingAction}>
              <input name="batchId" type="hidden" value={batchId} />
              <SubmitButton compact pendingLabel="Discarding…" variant="danger">
                Discard what is not approved
              </SubmitButton>
            </form>
          ) : null}
        </div>
        {notice && notices[notice] ? <p className="notice notice--success">{notices[notice]}</p> : null}
        <p className="muted">
          Check each question against the document, correct anything the model got
          wrong, add any figure it flagged, then approve. A figure taken out of a
          Word upload is already attached; one the document could not give up is
          named in the notes and has to be pasted in. Nothing enters the bank
          until you approve it, and a DI set&apos;s passage is approved before its
          questions.
        </p>
      </section>

      {createdIds.length > 0 ? (
        <section className="panel">
          <h2>The question IDs this import created</h2>
          <p className="muted">
            In the order the document listed them. Quote these in a mock document
            to build a mock from this paper without picking anything by hand.
          </p>
          <CopyIds
            ids={formatQuestionIdList(createdIds)}
            label={`${createdIds.length} ${createdIds.length === 1 ? "question" : "questions"} approved so far`}
          />
        </section>
      ) : null}

      {rows.map((row) => {
        const parsed = row.parsed;
        const heading = `${row.position + 1}. ${parsed ? questionTypeLabels[parsed.type] : "Unreadable entry"}${
          parsed?.parentPosition !== null && parsed?.parentPosition !== undefined
            ? ` · part of set ${parsed.parentPosition + 1}`
            : ""
        }`;
        const parentSet = parsed?.parentPosition != null ? parentSets[parsed.parentPosition] ?? null : null;
        const waitingForSet = parsed?.parentPosition != null && !parentSet;
        const verdict = row.status === "pending_review" ? parsed?.duplicate : undefined;
        // Already held: linking is the only sensible approval, so no editor.
        const linkOnly = verdict?.kind === "same" || verdict?.kind === "repeat";
        const correctable =
          verdict?.kind === "possible" && parsed?.parentPosition === null
            ? verdict.candidates.flatMap((candidate) => (candidate.source === "bank" ? [candidate.questionId] : []))
            : [];

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

            {verdict ? (
              <DuplicateNotice bankTexts={bankTexts} batchId={batchId} questionIdAt={questionIdAt} row={row} verdict={verdict} />
            ) : null}

            <div className="import-row">
              <SourceColumn problems={liveProblems(row, sections, orgId)} row={row} />

              {row.status !== "pending_review" || linkOnly ? null : !parsed ? (
                <p className="muted">This entry is not a question this bank can hold. Reject it.</p>
              ) : waitingForSet ? (
                <p className="notice notice--warn">Approve the set&apos;s passage (question {parsed.parentPosition! + 1}) first.</p>
              ) : (
                <QuestionEditor
                  action={approveImportAction}
                  alternateSubmits={correctable.map((questionId) => ({
                    label: `Save as a corrected version of ${formatQuestionId(questionId)}`,
                    name: "intoQuestionId",
                    value: String(questionId),
                  }))}
                  hidden={{ importId: String(row.id) }}
                  imageUrls={imageUrls}
                  initialValues={stagedToFormValues(parsed, matchSection(parsed.sectionName, sections))}
                  orgId={orgId}
                  parent={parentSet}
                  questionId={null}
                  sections={sections}
                  submitLabel={verdict?.kind === "possible" ? "Approve as a different question" : "Approve into the bank"}
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
