import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton } from "@/shared/ui";

import { createSectionAction, deleteSectionAction, updateSectionAction } from "../actions/section-actions";
import { sectionErrors, sectionNotices, type SectionError, type SectionNotice } from "../list-params";
import type { QuestionSection } from "../queries/list-sections";

// The fixed list of sections the analytics group on. Plain forms throughout,
// so every change here works with scripting off.
export function SectionsScreen({
  error,
  notice,
  profile,
  sections,
}: {
  error: SectionError | null;
  notice: SectionNotice | null;
  profile: Profile;
  sections: QuestionSection[];
}) {
  return (
    <RoleShell profile={profile} title="Question sections">
      <p>
        <Link href="/admin/questions">← Back to the question bank</Link>
      </p>

      <section className="panel">
        <div>
          <h2>Sections</h2>
          <p className="muted">
            Every question belongs to one of these, and the score breakdown a
            student sees is by section. Lower numbers come first.
          </p>
        </div>

        {notice ? <p className="muted">{sectionNotices[notice]}</p> : null}
        {error ? (
          <p className="form-error" role="alert">
            {sectionErrors[error]}
          </p>
        ) : null}

        {sections.length === 0 ? (
          <p className="muted">No sections yet. Add the first below.</p>
        ) : (
          <div className="choice-list">
            {sections.map((section) => (
              <div className="toolbar" key={section.id}>
                <form action={updateSectionAction} className="row-form">
                  <input name="sectionId" type="hidden" value={section.id} />
                  <label className="field field--inline" htmlFor={`section-name-${section.id}`}>
                    <span className="field__label">Name</span>
                    <input
                      className="input"
                      defaultValue={section.name}
                      id={`section-name-${section.id}`}
                      maxLength={60}
                      name="name"
                      required
                    />
                  </label>
                  <label className="field field--inline" htmlFor={`section-order-${section.id}`}>
                    <span className="field__label">Order</span>
                    <input
                      className="input input--compact"
                      defaultValue={section.sortOrder}
                      id={`section-order-${section.id}`}
                      inputMode="numeric"
                      name="sortOrder"
                    />
                  </label>
                  <SubmitButton compact pendingLabel="Saving…" variant="secondary">
                    Save
                  </SubmitButton>
                </form>
                <span className="muted">
                  {section.questionCount} {section.questionCount === 1 ? "question" : "questions"}
                </span>
                {section.questionCount === 0 ? (
                  <form action={deleteSectionAction}>
                    <input name="sectionId" type="hidden" value={section.id} />
                    <SubmitButton compact pendingLabel="Removing…" variant="danger">
                      Remove
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel panel--narrow">
        <h2>Add a section</h2>
        <form action={createSectionAction} className="stack-form">
          <label className="field" htmlFor="new-section-name">
            <span className="field__label">Name</span>
            <input className="input" id="new-section-name" maxLength={60} name="name" placeholder="QA" required />
          </label>
          <label className="field" htmlFor="new-section-order">
            <span className="field__label">Order (optional)</span>
            <input className="input" id="new-section-order" inputMode="numeric" name="sortOrder" placeholder="0" />
          </label>
          <div className="form-actions">
            <SubmitButton pendingLabel="Adding…">Add section</SubmitButton>
          </div>
        </form>
      </section>
    </RoleShell>
  );
}
