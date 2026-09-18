import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

import type { ReportView } from "../queries/get-report";

export function ReportViewScreen({ profile, report }: { profile: Profile; report: ReportView }) {
  return (
    <RoleShell profile={profile} title="Your ARS report">
      <section className="panel">
        <div className="panel__header">
          <div><h2>{report.templateName}</h2><p className="muted">Overall score: {report.overallScore ?? "—"}/100{report.overallLevel ? ` · ${report.overallLevel}` : ""}</p></div>
          <Link className="button button--secondary" href="/student">Back to learning</Link>
        </div>
      </section>
      {report.components.map((component) => (
        <section className="panel" key={component.templateComponentId}>
          <div className="panel__header"><div><h2>{component.title}</h2><p className="muted">{component.score ?? "—"}/10 · {component.readinessTag ?? "Not labelled"} · weight {component.weightagePct}%</p></div></div>
          <div className="report-copy">
            {component.metrics.map((metric, index) => {
              const value = metric as Record<string, unknown>;
              return <p key={index}><strong>{typeof value.name === "string" ? value.name : `Metric ${index + 1}`}</strong><br />{typeof value.score === "number" ? `${value.score}/10` : "—"}{typeof value.note === "string" && value.note ? ` · ${value.note}` : ""}</p>;
            })}
            {component.usesStrengths ? <p><strong>Strengths</strong><br />{component.strengths ?? "—"}</p> : null}
            {component.usesDevelopmentAreas ? <p><strong>Development areas</strong><br />{component.developmentAreas ?? "—"}</p> : null}
            {component.usesActionPlan ? <p><strong>Action plan</strong><br />{component.actionPlan ?? "—"}</p> : null}
            <p><strong>Timeline</strong><br />{component.timeline ?? "—"}</p>
            <p><strong>Next step</strong><br />{component.nextStep ?? "—"}</p>
          </div>
        </section>
      ))}
      {report.closingNote ? <section className="panel"><h2>A note from your mentor</h2><p className="report-note">{report.closingNote}</p></section> : null}
    </RoleShell>
  );
}
