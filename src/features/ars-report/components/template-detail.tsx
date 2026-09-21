import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

import {
  addComponentAction,
  removeComponentAction,
  saveWeightagesAction,
  updateTemplateAction,
} from "../actions/template-actions";
import {
  templateErrorMessages,
  templateNoticeMessages,
  type TemplateError,
  type TemplateNotice,
} from "../list-params";
import type { TemplateDetail } from "../queries/get-template";
import { SubmitButton } from "@/shared/ui";

export function TemplateDetailScreen({
  error,
  notice,
  profile,
  template,
}: {
  error: TemplateError | null;
  notice: TemplateNotice | null;
  profile: Profile;
  template: TemplateDetail;
}) {
  const remaining = Math.round((100 - template.weightageTotal) * 100) / 100;

  return (
    <RoleShell profile={profile} title={template.name}>
      {error ? <p className="form-error" role="alert">{templateErrorMessages[error]}</p> : null}
      {notice ? <p className="muted">{templateNoticeMessages[notice]}</p> : null}

      <p><Link href="/admin/report-templates">← All templates</Link></p>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Template</h2>
            <p className="muted">
              The two vocabularies below are the words a mentor may choose from. One per line,
              or comma separated.
            </p>
          </div>
        </div>

        <form action={updateTemplateAction} className="stack-form">
          <input name="templateId" type="hidden" value={template.id} />

          <label htmlFor="name">Name</label>
          <input defaultValue={template.name} id="name" maxLength={120} name="name" required type="text" />

          <label htmlFor="courseId">Programme</label>
          <select defaultValue={template.courseId ?? ""} id="courseId" name="courseId">
            <option value="">Any programme</option>
            {template.courseOptions.map((course) => (
              <option key={course.id} value={course.id}>{course.title}</option>
            ))}
          </select>

          <label htmlFor="readinessTags">Readiness tags (per component)</label>
          <textarea
            defaultValue={template.readinessTags.join("\n")}
            id="readinessTags"
            name="readinessTags"
            rows={3}
          />

          <label htmlFor="overallLevels">Overall readiness levels (whole report)</label>
          <textarea
            defaultValue={template.overallLevels.join("\n")}
            id="overallLevels"
            name="overallLevels"
            rows={3}
          />

          <label className="choice" htmlFor="isActive">
            <input
              defaultChecked={template.isActive}
              id="isActive"
              name="isActive"
              type="checkbox"
            />
            <span>Active — mentors may start reports from this template</span>
          </label>

          <SubmitButton variant="primary" pendingLabel="Saving…">Save template</SubmitButton>
        </form>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Components</h2>
            <p className="muted">
              Each component carries a score out of ten and a weightage. The overall score is
              calculated from these — a mentor never types a total.
            </p>
          </div>
          <p className={template.weightageTotal === 100 ? "pill" : "pill pill--disabled"}>
            {template.weightageTotal}% of 100
          </p>
        </div>

        {template.weightageTotal !== 100 ? (
          <p className="muted">
            {remaining > 0
              ? `${remaining}% still to allocate. A report cannot be released until the components total exactly 100.`
              : `${Math.abs(remaining)}% over. Lower a component below before adding another.`}
          </p>
        ) : null}

        {template.components.length === 0 ? (
          <p className="muted">No component yet. Add the first one below.</p>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Component</th>
                  <th scope="col">Round</th>
                  <th scope="col">Sub-metrics</th>
                  <th scope="col">Blocks</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {template.components.map((component) => (
                  <tr key={component.id}>
                    <td>
                      <strong>{component.title}</strong>
                      <p className="muted">{component.weightagePct}%</p>
                    </td>
                    <td>
                      {component.roundName ?? <span className="muted">No round</span>}
                    </td>
                    <td>
                      <span className="muted">{component.metricLabel}: </span>
                      {component.metricNames.length === 0
                        ? <span className="muted">none</span>
                        : component.metricNames.join(", ")}
                      <p className="muted">
                        {component.metricHasScores ? "scored" : "not scored"}
                        {component.metricHasNotes ? ", with notes" : ", no notes"}
                      </p>
                    </td>
                    <td className="muted">
                      {[
                        component.usesStrengths ? "Strengths" : null,
                        component.usesDevelopmentAreas ? "Development areas" : null,
                        component.usesActionPlan ? "Action plan" : null,
                      ].filter(Boolean).join(", ") || "None"}
                    </td>
                    <td>
                      <form action={removeComponentAction}>
                        <input name="componentId" type="hidden" value={component.id} />
                        <input name="templateId" type="hidden" value={template.id} />
                        <SubmitButton variant="secondary" pendingLabel="Removing…">Remove</SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/*
              Every weightage is submitted together, and the action applies each
              decrease before any increase. Editing them one at a time would make
              a straight swap impossible: the raise would be refused for taking
              the total past 100 before the matching drop had been applied.
            */}
            <form action={saveWeightagesAction} className="stack-form">
              <input name="templateId" type="hidden" value={template.id} />
              <h3>Weightages</h3>
              <p className="muted">
                Change several at once. Swapping two values works here and would be refused
                if they were edited one by one.
              </p>
              {template.components.map((component) => (
                <div className="field-row" key={component.id}>
                  <label htmlFor={`weightage-${component.id}`}>{component.title}</label>
                  <input
                    defaultValue={component.weightagePct}
                    id={`weightage-${component.id}`}
                    inputMode="decimal"
                    name={`weightage-${component.id}`}
                    required
                    type="text"
                  />
                </div>
              ))}
              <SubmitButton variant="primary" pendingLabel="Saving…">Save weightages</SubmitButton>
            </form>
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Add a component</h2>
            <p className="muted">
              A component need not belong to a round. An assessment of the student&apos;s own
              profile has nothing to submit, and still belongs in the report.
            </p>
          </div>
        </div>

        <form action={addComponentAction} className="stack-form">
          <input name="templateId" type="hidden" value={template.id} />

          <label htmlFor="title">Title</label>
          <input id="title" maxLength={120} name="title" placeholder="Video Essay" required type="text" />

          <label htmlFor="weightagePct">Weightage %</label>
          <input
            id="weightagePct"
            inputMode="decimal"
            name="weightagePct"
            placeholder={remaining > 0 ? String(remaining) : "20"}
            required
            type="text"
          />

          <label htmlFor="roundId">Round (optional)</label>
          <select defaultValue="" id="roundId" name="roundId">
            <option value="">No round — assessed without a submission</option>
            {template.roundOptions.map((round) => (
              <option key={round.id} value={round.id}>{round.name}</option>
            ))}
          </select>

          <label htmlFor="metricLabel">Sub-metric column heading</label>
          <input
            defaultValue="Metric"
            id="metricLabel"
            maxLength={40}
            name="metricLabel"
            type="text"
          />

          <label htmlFor="metricNames">Sub-metrics, one per line</label>
          <textarea
            id="metricNames"
            name="metricNames"
            placeholder={"Originality\nCommunication\nDelivery"}
            rows={4}
          />

          <label className="choice" htmlFor="metricHasScores">
            <input defaultChecked id="metricHasScores" name="metricHasScores" type="checkbox" />
            <span>Each sub-metric is scored</span>
          </label>
          <label className="choice" htmlFor="metricHasNotes">
            <input defaultChecked id="metricHasNotes" name="metricHasNotes" type="checkbox" />
            <span>Each sub-metric takes a written note</span>
          </label>
          <label className="choice" htmlFor="usesStrengths">
            <input defaultChecked id="usesStrengths" name="usesStrengths" type="checkbox" />
            <span>Strengths</span>
          </label>
          <label className="choice" htmlFor="usesDevelopmentAreas">
            <input defaultChecked id="usesDevelopmentAreas" name="usesDevelopmentAreas" type="checkbox" />
            <span>Development areas</span>
          </label>
          <label className="choice" htmlFor="usesActionPlan">
            <input defaultChecked id="usesActionPlan" name="usesActionPlan" type="checkbox" />
            <span>Action plan</span>
          </label>

          <SubmitButton variant="primary" pendingLabel="Adding…">Add component</SubmitButton>
        </form>
      </section>
    </RoleShell>
  );
}
