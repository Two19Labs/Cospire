import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton } from "@/shared/ui";

import { saveMockAction } from "../actions/mock-actions";
import { maxMockSections } from "../mock-form";
import type { MockEditorValue, PickerQuestion } from "../queries/mock-builder";

const errors: Record<string, string> = {
  duration: "Section durations must add up exactly to the full mock duration.",
  failed: "The mock could not be saved.", invalid: "Check the mock settings.",
  archived: "A selected question has been archived. Untick it below, then save again.",
  questions: "One or more selected questions are unavailable.",
  "section-missing": "Every selected question needs a section that still exists. Check the section dropdowns.",
  sections: "Every named section needs a valid duration.", structure: "The database refused that mock structure.",
};

function excerpt(body: string): string {
  const value = body.replace(/\s+/g, " ").trim();
  return value.length > 100 ? `${value.slice(0, 97)}…` : value;
}

export function MockEditor({ profile, value, picker, offPage = [], error, notice }: {
  profile: Profile; value: MockEditorValue | null;
  picker: { rows: PickerQuestion[]; page: number; pageCount: number };
  offPage?: PickerQuestion[];
  error?: string; notice?: string;
}) {
  const existingSections = value?.sections ?? [];
  const sectional = existingSections.length > 1 || (existingSections[0]?.durationMinutes ?? null) !== null;
  const selectedSection = new Map<number, number>();
  existingSections.forEach((section, index) => section.questionIds.forEach((id) => selectedSection.set(id, index)));
  const offPageIds = new Set(offPage.map((question) => question.id));

  // One renderer for both lists. A row that cannot be selected -- archived, or a
  // DI set with no sub-questions -- still renders, unticked and disabled when it
  // was never in the mock, and tickable-off when it was. Hiding it was what left
  // an archived question posted invisibly on every save.
  function row(question: PickerQuestion, selected: boolean) {
    const locked = !question.selectable && !selected;
    return <div className="question-picker-row" key={question.id}>
      <label><input defaultChecked={selected} disabled={locked} name="questionId" type="checkbox" value={question.id} /> <strong>{excerpt(question.body)}</strong></label>
      <span className="muted">{question.sectionName} · {question.topic} · {question.difficulty}{question.type === "di_stimulus" ? ` · DI set (${question.childCount} questions)` : ` · ${question.marks} marks`}{question.unselectableReason ? ` · ${question.unselectableReason}` : ""}</span>
      <label><span className="field__label">Put in section</span><select className="input input--compact" defaultValue={selectedSection.get(question.id) ?? 0} name={`questionSection_${question.id}`}>{Array.from({ length: maxMockSections }, (_, index) => <option key={index} value={index}>Section {index + 1}</option>)}</select></label>
    </div>;
  }

  return (
    <RoleShell profile={profile} title={value ? "Edit mock" : "New mock"}>
      <form action={saveMockAction}>
        {value ? <input name="mockId" type="hidden" value={value.id} /> : null}
        {notice === "saved" ? <p className="notice notice--success">Mock saved.</p> : null}
        {error && errors[error] ? <p className="notice notice--error">{errors[error]}</p> : null}
        <section className="panel"><div className="panel__header"><div><h2>Settings</h2><p className="muted">The overall timer is always authoritative.</p></div></div>
          <div className="form-grid">
            <label className="field"><span className="field__label">Title</span><input className="input" defaultValue={value?.title} maxLength={160} name="title" required /></label>
            <label className="field"><span className="field__label">Full duration (minutes)</span><input className="input" defaultValue={value?.durationMinutes ?? 120} min={1} max={1440} name="durationMinutes" required type="number" /></label>
            <label className="field field--full"><span className="field__label">Instructions</span><textarea className="input" defaultValue={value?.instructions} maxLength={20000} name="instructions" rows={5} /></label>
            <label className="field"><span className="field__label">Attempt limit</span><input className="input" defaultValue={value?.maxAttempts ?? 1} min={1} max={100} name="maxAttempts" required type="number" /></label>
            <label className="field"><span className="field__label">Penalty per wrong answer</span><input className="input" defaultValue={value?.negativeMarking ?? "0"} min={0} max={100} name="negativeMarking" step="0.01" required type="number" /></label>
          </div>
          <fieldset className="field"><legend className="field__label">Negative marking applies to</legend>
            {[["mcq", "Single-correct MCQ"], ["mcq_multi", "Multiple-correct MCQ"], ["numerical", "Numerical"]].map(([type, label]) => <label key={type}><input defaultChecked={value ? value.negativeMarkingTypes.includes(type) : type !== "numerical"} name={`negative_${type}`} type="checkbox" /> {label}</label>)}
          </fieldset>
          <div className="form-grid"><label><input defaultChecked={value?.allowMobile ?? true} name="allowMobile" type="checkbox" /> Allow phone attempts</label><label><input defaultChecked={value?.proctoringEnabled ?? false} name="proctoringEnabled" type="checkbox" /> Enable proctoring</label></div>
        </section>
        <section className="panel"><h2>Timing structure</h2><p className="muted">For sectional timing, every duration is required and the total must equal the full duration. Overall-only timing stores one implicit section with no sectional limit.</p>
          <label><input defaultChecked={!sectional} name="timingMode" type="radio" value="overall" /> Overall timer only</label>{" "}
          <label><input defaultChecked={sectional} name="timingMode" type="radio" value="sectional" /> Sectional timers</label>
          <div className="form-grid">{Array.from({ length: maxMockSections }, (_, index) => (
            <div className="field" key={index}><span className="field__label">Section {index + 1}</span>
              <input className="input" defaultValue={existingSections[index]?.title ?? ""} name={`sectionTitle_${index}`} placeholder={index < 2 ? (index === 0 ? "QA" : "LR") : "Optional"} />
              <input className="input" defaultValue={existingSections[index]?.durationMinutes ?? ""} min={1} max={1440} name={`sectionDuration_${index}`} placeholder="Minutes" type="number" />
            </div>
          ))}</div>
        </section>
        <section className="panel"><h2>Questions</h2><p className="muted">Only active questions are offered. Selecting a DI set adds its passage and every sub-question.</p>
          {offPage.length > 0 ? <><h3 className="field__label">Already in this mock, from other pages</h3>{offPage.map((question) => row(question, true))}</> : null}
          {picker.rows.length === 0 ? <p className="muted">No active questions on this page.</p> : picker.rows.filter((question) => !offPageIds.has(question.id)).map((question) => row(question, selectedSection.has(question.id)))}
          {picker.pageCount > 1 ? <nav aria-label="Question picker pagination" className="pagination">
            {picker.page > 1 ? <Link href={`${value ? `/admin/mocks/${value.id}` : "/admin/mocks/new"}?page=${picker.page - 1}`}>Previous</Link> : <span className="muted">Previous</span>}
            <span className="muted">Question page {picker.page} of {picker.pageCount}. Save before changing pages.</span>
            {picker.page < picker.pageCount ? <Link href={`${value ? `/admin/mocks/${value.id}` : "/admin/mocks/new"}?page=${picker.page + 1}`}>Next</Link> : <span className="muted">Next</span>}
          </nav> : null}
        </section>
        <div className="toolbar"><SubmitButton pendingLabel="Saving…">Save mock</SubmitButton><Link className="button button--secondary" href="/admin/mocks">Back to mocks</Link></div>
      </form>
    </RoleShell>
  );
}
