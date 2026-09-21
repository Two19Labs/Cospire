import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

import {
  releaseReportAction,
  saveReportComponentAction,
} from "../actions/report-actions";
import type { ReportComponentView, ReportView } from "../queries/get-report";
import { SubmitButton } from "@/shared/ui";

function MetricValues({ component }: { component: ReportComponentView }) {
  return component.metrics.map((metric, index) => {
    const value = metric as Record<string, unknown>;
    const name = typeof value.name === "string" ? value.name : `Metric ${index + 1}`;
    return (
      <p key={`${name}-${index}`}>
        <strong>{name}:</strong>{" "}
        {typeof value.score === "number" ? `${value.score}/10` : "—"}
        {typeof value.note === "string" && value.note ? ` · ${value.note}` : ""}
      </p>
    );
  });
}

export function ReportEditor({ profile, report }: { profile: Profile; report: ReportView }) {
  const released = report.status === "released";
  return (
    <RoleShell profile={profile} title={`${report.studentName} · ARS report`}>
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>{report.templateName}</h2>
            <p className="muted">Overall score: {report.overallScore ?? "—"}/100 · {report.status}</p>
          </div>
          <Link className="button button--secondary" href="/mentor">Back to queue</Link>
        </div>
      </section>

      {report.components.map((component) => (
        <section className="panel" key={component.templateComponentId}>
          <div className="panel__header">
            <div><h2>{component.title}</h2><p className="muted">Weight {component.weightagePct}%</p></div>
          </div>
          {released ? (
            <div className="report-copy">
              <p><strong>Score:</strong> {component.score ?? "—"}/10</p>
              <p><strong>Readiness:</strong> {component.readinessTag ?? "—"}</p>
              <MetricValues component={component} />
              <p><strong>Strengths:</strong> {component.strengths ?? "—"}</p>
              <p><strong>Development areas:</strong> {component.developmentAreas ?? "—"}</p>
              <p><strong>Action plan:</strong> {component.actionPlan ?? "—"}</p>
              <p><strong>Timeline:</strong> {component.timeline ?? "—"}</p>
              <p><strong>Next step:</strong> {component.nextStep ?? "—"}</p>
            </div>
          ) : (
            <form action={saveReportComponentAction} className="stack-form">
              <input name="reportId" type="hidden" value={report.id} />
              <input name="templateComponentId" type="hidden" value={component.templateComponentId} />
              <div className="field-row">
                <label>Score out of 10<input defaultValue={component.score ?? ""} max="10" min="0" name="score" required step="0.1" type="number" /></label>
                <label>Readiness<select defaultValue={component.readinessTag ?? ""} name="readinessTag" required><option disabled value="">Choose</option>{report.readinessTags.map((tag) => <option key={tag}>{tag}</option>)}</select></label>
              </div>
              {component.metricNames.map((name, index) => {
                const saved = (component.metrics[index] ?? {}) as Record<string, unknown>;
                return (
                  <fieldset className="metric-row" key={`${name}-${index}`}>
                    <legend>{component.metricLabel}: {name}</legend>
                    <div className="field-row">
                      {component.metricHasScores ? <label>Score<input defaultValue={typeof saved.score === "number" ? saved.score : ""} max="10" min="0" name={`metricScore_${index}`} step="0.1" type="number" /></label> : null}
                      {component.metricHasNotes ? <label>Observation<textarea defaultValue={typeof saved.note === "string" ? saved.note : ""} name={`metricNote_${index}`} rows={2} /></label> : null}
                    </div>
                  </fieldset>
                );
              })}
              {component.usesStrengths ? <label>Strengths<textarea defaultValue={component.strengths ?? ""} name="strengths" rows={3} /></label> : null}
              {component.usesDevelopmentAreas ? <label>Development areas<textarea defaultValue={component.developmentAreas ?? ""} name="developmentAreas" rows={3} /></label> : null}
              {component.usesActionPlan ? <label>Action plan<textarea defaultValue={component.actionPlan ?? ""} name="actionPlan" rows={3} /></label> : null}
              <div className="field-row"><label>Timeline<input defaultValue={component.timeline ?? ""} name="timeline" /></label><label>Next step<input defaultValue={component.nextStep ?? ""} name="nextStep" /></label></div>
              <SubmitButton variant="primary" pendingLabel="Saving…">Save component</SubmitButton>
            </form>
          )}
        </section>
      ))}

      {!released ? (
        <section className="panel">
          <h2>Release to student</h2>
          <form action={releaseReportAction} className="stack-form">
            <input name="reportId" type="hidden" value={report.id} />
            <label>Overall level<select defaultValue={report.overallLevel ?? ""} name="overallLevel" required><option disabled value="">Choose</option>{report.overallLevels.map((level) => <option key={level}>{level}</option>)}</select></label>
            <label>Closing note<textarea defaultValue={report.closingNote ?? ""} name="closingNote" rows={5} /></label>
            <SubmitButton variant="primary" pendingLabel="Releasing…">Release completed report</SubmitButton>
          </form>
        </section>
      ) : null}
    </RoleShell>
  );
}
