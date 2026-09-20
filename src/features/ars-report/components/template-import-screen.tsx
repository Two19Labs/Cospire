"use client";

import Link from "next/link";
import { useActionState } from "react";

import { createImportedTemplateAction, previewTemplateImportAction } from "../actions/template-import-actions";
import { initialTemplateImportState } from "../template-import-state";

export function TemplateImportScreen({ courses, prompt }: { courses: { id: number; title: string }[]; prompt: string }) {
  const [state, preview, reading] = useActionState(previewTemplateImportAction, initialTemplateImportState);
  const [createState, create, creating] = useActionState(createImportedTemplateAction, initialTemplateImportState);
  const problems = createState.problems.length ? createState.problems : state.problems;
  const template = state.template;
  return <>
    <section className="panel"><h2>Build a report template from a document</h2><p className="muted">Use the same reviewed paste-to-build workflow as the ARS process importer. Nothing is saved until you inspect the preview and confirm.</p><Link className="button button--secondary" href="/admin/report-templates">Back to templates</Link></section>
    <section className="panel"><h3>Step 1 — copy this prompt</h3><p className="muted">Paste it into your AI model, attach the report document, then copy the complete JSON answer.</p><textarea aria-label="The prompt to copy" className="input input--code" readOnly rows={12} value={prompt} /></section>
    <form action={preview} className="panel stack-form"><h3>Step 2 — paste the model’s answer</h3><textarea className="input input--code" defaultValue={state.pasted || createState.pasted} name="pasted" required rows={12} /><button className="button button--primary" disabled={reading} type="submit">{reading ? "Reading…" : "Preview template"}</button></form>
    {problems.length ? <section className="panel" role="alert"><h3>That could not be used</h3><ul className="form-error">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul><p className="muted">Nothing has been saved.</p></section> : null}
    {template ? <>
      <section className="panel"><h3>Step 3 — check, then create</h3><h4>{template.name}</h4><p className="muted">Readiness: {template.readinessTags.join(", ")} · Overall: {template.overallLevels.join(", ")}</p><div className="report-list">{template.components.map((component) => <article className="report-list__item" key={component.title}><div><strong>{component.title}</strong><p className="muted">{component.weightagePct}%{component.roundName ? ` · round: ${component.roundName}` : " · no round"}</p><p className="muted">{component.metricNames.length ? component.metricNames.join(", ") : "No sub-metrics"}</p></div></article>)}</div></section>
      <form action={create} className="panel stack-form"><input name="pasted" type="hidden" value={state.pasted} /><label htmlFor="courseId">Programme (optional)</label><select defaultValue="" id="courseId" name="courseId"><option value="">Any programme</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select><p className="muted">Choose a programme when the parsed components name ARS rounds. Round names must match before creation.</p><button className="button button--primary" disabled={creating} type="submit">{creating ? "Creating…" : `Create ${template.components.length}-component template`}</button></form>
    </> : null}
  </>;
}
