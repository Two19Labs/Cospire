import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton } from "@/shared/ui";

import { saveMockAction } from "../actions/mock-actions";
import { maxMockSections } from "../mock-form";
import type { MockEditorValue, PickerQuestion } from "../queries/mock-builder";
import { PendingOverlay } from "./pending-overlay";

const errors: Record<string, string> = {
  duration: "Section durations must add up exactly to the full mock duration.",
  marks: "Marks must be a number above 0 and at most 100, or left blank.",
  failed: "The mock could not be saved.", invalid: "Check the mock settings.",
  archived: "A selected question has been archived. Untick it below, then save again.",
  questions: "One or more selected questions are unavailable.",
  "section-missing": "Every selected question needs a section that still exists. Check the section dropdowns.",
  sections: "Every named section needs a valid duration.", structure: "The database refused that mock structure.",
  attempted: "Students have already sat this mock, so it can no longer be changed. Build a new mock instead.",
};

function excerpt(body: string): string {
  const value = body.replace(/\s+/g, " ").trim();
  return value.length > 100 ? `${value.slice(0, 97)}…` : value;
}

// The mock builder, in the workspace layout: settings, timing and questions as
// panels inside one form, a summary of the saved mock beside it, and the panels
// other features own (the test engine's students and attempts) underneath.
// Every field name is unchanged: the save action and the verify harnesses read
// them by name.
export function MockEditor({ profile, value, picker, offPage = [], error, notice, children }: {
  profile: Profile; value: MockEditorValue | null;
  picker: { rows: PickerQuestion[]; page: number; pageCount: number };
  offPage?: PickerQuestion[];
  error?: string; notice?: string;
  // Panels owned by other features, shown under the form: the test engine's student access.
  children?: React.ReactNode;
}) {
  const existingSections = value?.sections ?? [];
  const sectional = existingSections.length > 1 || (existingSections[0]?.durationMinutes ?? null) !== null;
  // One mock-wide value when every section agrees; a section that differs shows
  // its own number in its slot.
  const sectionMarks = existingSections.map((section) => section.marks);
  const mockMarks = sectionMarks.length > 0 && sectionMarks.every((marks) => marks === sectionMarks[0]) ? sectionMarks[0] : null;
  const selectedSection = new Map<number, number>();
  existingSections.forEach((section, index) => section.questionIds.forEach((id) => selectedSection.set(id, index)));
  const offPageIds = new Set(offPage.map((question) => question.id));
  const base = value ? `/admin/mocks/${value.id}` : "/admin/mocks/new";

  // One renderer for both lists. A row that cannot be selected -- archived, or a
  // DI set with no sub-questions -- still renders, unticked and disabled when it
  // was never in the mock, and tickable-off when it was. Hiding it was what left
  // an archived question posted invisibly on every save.
  function row(question: PickerQuestion, selected: boolean) {
    const locked = !question.selectable && !selected;
    return <div className="question-picker-row" key={question.id}>
      <label className="choice"><input defaultChecked={selected} disabled={locked} name="questionId" type="checkbox" value={question.id} /> <strong>{excerpt(question.body)}</strong></label>
      <span className="muted">{question.sectionName} · {question.topic} · {question.difficulty}{question.type === "di_stimulus" ? ` · DI set (${question.childCount} questions)` : ` · ${question.marks} marks`}{question.unselectableReason ? ` · ${question.unselectableReason}` : ""}</span>
      <label><span className="field__label">Put in section</span><select className="input input--compact" defaultValue={selectedSection.get(question.id) ?? 0} name={`questionSection_${question.id}`}>{Array.from({ length: maxMockSections }, (_, index) => <option key={index} value={index}>Section {index + 1}</option>)}</select></label>
    </div>;
  }

  return (
    <RoleShell
      actions={
        <Link className="button button--secondary" href="/admin/mocks">
          Back to mocks
        </Link>
      }
      back={{ href: "/admin/mocks", label: "All mock tests" }}
      description="Bring the right questions, timing and scoring into one assessment."
      heading={value ? value.title : "Build a mock test"}
      profile={profile}
      title={value ? "Edit mock" : "New mock"}
    >
      {/* In-page sections rather than tabs that need JavaScript. */}
      <nav aria-label="Page sections" className="tabs">
        <a className="tabs__link tabs__link--current" href="#settings">01 · Settings</a>
        <a className="tabs__link" href="#timing">02 · Timing &amp; sections</a>
        <a className="tabs__link" href="#questions">03 · Questions</a>
        {value ? <a className="tabs__link" href="#students">Students</a> : null}
        {value ? <a className="tabs__link" href="#attempts">Attempts</a> : null}
      </nav>

      <div className="two-col">
        <form action={saveMockAction} className="two-col__main">
          {value ? <input name="mockId" type="hidden" value={value.id} /> : null}
          {notice === "saved" ? <p className="notice notice--success">Mock saved.</p> : null}
          {notice === "built" ? <p className="notice notice--success">Mock built from the paper. Check the settings, then it is ready.</p> : null}
          {notice === "built-grant-failed" ? <p className="notice notice--error">The mock was built, but granting it to the students failed. Grant them below.</p> : null}
          {error && errors[error] ? <p className="notice notice--error">{errors[error]}</p> : null}

          <section className="panel" id="settings">
            <div className="panel__header"><div><h2>Test settings</h2><p className="muted">The overall timer is always authoritative.</p></div></div>
            <div className="form-grid">
              <label className="field"><span className="field__label">Title</span><input className="input" defaultValue={value?.title} maxLength={160} name="title" required /></label>
              <label className="field"><span className="field__label">Full duration (minutes)</span><input className="input" defaultValue={value?.durationMinutes ?? 120} min={1} max={1440} name="durationMinutes" required type="number" /></label>
              <label className="field field--full"><span className="field__label">Instructions</span><textarea className="input" defaultValue={value?.instructions} maxLength={20000} name="instructions" rows={5} /></label>
              <label className="field"><span className="field__label">Attempt limit</span><input className="input" defaultValue={value?.maxAttempts ?? 1} min={1} max={100} name="maxAttempts" required type="number" /></label>
              <label className="field"><span className="field__label">Marks per correct answer</span><input className="input" defaultValue={mockMarks ?? ""} min={0.01} max={100} name="marks" placeholder="Each question's own" step="0.01" type="number" /><span className="field__hint">Applies to every section. Leave blank to use each question&apos;s own marks.</span></label>
              <label className="field"><span className="field__label">Penalty per wrong answer</span><input className="input" defaultValue={value?.negativeMarking ?? "0"} min={0} max={100} name="negativeMarking" step="0.01" required type="number" /></label>
            </div>
            <fieldset className="field"><legend className="field__label">Negative marking applies to</legend>
              <div className="toggle-list">
                {[["mcq", "Single-correct MCQ"], ["mcq_multi", "Multiple-correct MCQ"], ["numerical", "Numerical"]].map(([type, label]) => <label className="choice" key={type}><input defaultChecked={value ? value.negativeMarkingTypes.includes(type) : type !== "numerical"} name={`negative_${type}`} type="checkbox" /> <span>{label}</span></label>)}
              </div>
            </fieldset>
            <div className="toggle-list">
              <label className="choice"><input defaultChecked={value?.allowMobile ?? true} name="allowMobile" type="checkbox" /> <span>Allow phone attempts</span></label>
              <label className="choice"><input defaultChecked={value?.proctoringEnabled ?? false} name="proctoringEnabled" type="checkbox" /> <span>Enable proctoring</span></label>
            </div>
            <p className="notice">Phone attempts are always unproctored. Proctoring warns and logs events; it never submits an attempt on its own.</p>
          </section>

          <section className="panel" id="timing">
            <div className="panel__header"><div><h2>Timing structure</h2><p className="muted">For sectional timing, every duration is required and the total must equal the full duration. Overall-only timing stores one implicit section with no sectional limit.</p></div></div>
            <div className="toggle-list">
              <label className="choice"><input defaultChecked={!sectional} name="timingMode" type="radio" value="overall" /> <span>Overall timer only</span></label>
              <label className="choice"><input defaultChecked={sectional} name="timingMode" type="radio" value="sectional" /> <span>Sectional timers</span></label>
            </div>
            <div className="form-grid">{Array.from({ length: maxMockSections }, (_, index) => (
              <div className="field section-slot" key={index}><span className="field__label">Section {index + 1}</span>
                <input aria-label={`Section ${index + 1} title`} className="input" defaultValue={existingSections[index]?.title ?? ""} name={`sectionTitle_${index}`} placeholder={index < 2 ? (index === 0 ? "QA" : "LR") : "Optional"} />
                <input aria-label={`Section ${index + 1} minutes`} className="input" defaultValue={existingSections[index]?.durationMinutes ?? ""} min={1} max={1440} name={`sectionDuration_${index}`} placeholder="Minutes" type="number" />
                <input aria-label={`Section ${index + 1} marks per correct answer`} className="input" defaultValue={mockMarks === null ? existingSections[index]?.marks ?? "" : ""} min={0.01} max={100} name={`sectionMarks_${index}`} placeholder="Marks (optional)" step="0.01" type="number" />
              </div>
            ))}</div>
          </section>

          <section className="panel" id="questions">
            <div className="panel__header"><div><h2>Questions</h2><p className="muted">Only active questions are offered. Selecting a DI set adds its passage and every sub-question.</p></div><span className="tag">{selectedSection.size} selected</span></div>
            {offPage.length > 0 ? <><h3 className="field__label">Already in this mock, from other pages</h3>{offPage.map((question) => row(question, true))}</> : null}
            {picker.rows.length === 0 ? <p className="panel-empty">No active questions on this page.</p> : picker.rows.filter((question) => !offPageIds.has(question.id)).map((question) => row(question, selectedSection.has(question.id)))}
            {picker.pageCount > 1 ? <nav aria-label="Question picker pagination" className="pagination">
              {picker.page > 1 ? <Link href={`${base}?page=${picker.page - 1}`}>Previous</Link> : <span>Previous</span>}
              <span>Question page {picker.page} of {picker.pageCount}. Save before changing pages.</span>
              {picker.page < picker.pageCount ? <Link href={`${base}?page=${picker.page + 1}`}>Next</Link> : <span>Next</span>}
            </nav> : null}
          </section>

          <div className="form-bar">
            <Link className="button button--ghost" href="/admin/mocks">Cancel</Link>
            <SubmitButton pendingLabel="Saving…">Save mock</SubmitButton>
            <PendingOverlay label="Saving the mock…" detail="Every section and question is written in one go. Keep this tab open." />
          </div>
        </form>

        <aside className="summary-rail">
          <section className="panel">
            <div className="panel__header"><h2>At a glance</h2></div>
            <div>
              <p className="summary-row"><span>Duration</span><strong>{value ? `${value.durationMinutes} minutes` : "Not saved yet"}</strong></p>
              <p className="summary-row"><span>Timing</span><strong>{value ? (sectional ? `${existingSections.length} timed sections` : "Overall timer") : "—"}</strong></p>
              <p className="summary-row"><span>Selected questions</span><strong>{selectedSection.size}</strong></p>
              <p className="summary-row"><span>Attempt limit</span><strong>{value ? value.maxAttempts : "—"}</strong></p>
              <p className="summary-row"><span>Proctoring</span><strong>{value ? (value.proctoringEnabled ? "Enabled" : "Off") : "—"}</strong></p>
              <p className="summary-row"><span>Phones</span><strong>{value ? (value.allowMobile ? "Allowed, unproctored" : "Not allowed") : "—"}</strong></p>
            </div>
            <p className="field__hint">As last saved. Archived questions already in a mock stay listed so they can be removed.</p>
          </section>
        </aside>
      </div>

      {children}
    </RoleShell>
  );
}
