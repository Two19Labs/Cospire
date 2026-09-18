import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

import { createTemplateAction } from "../actions/template-actions";
import {
  buildTemplatesHref,
  templateErrorMessages,
  templateNoticeMessages,
  type TemplateError,
  type TemplateNotice,
} from "../list-params";
import type { TemplateListPage } from "../queries/list-templates";

export function TemplatesScreen({
  error,
  notice,
  profile,
  templates,
}: {
  error: TemplateError | null;
  notice: TemplateNotice | null;
  profile: Profile;
  templates: TemplateListPage;
}) {
  const { page, pageCount, rows, total } = templates;

  return (
    <RoleShell profile={profile} title="Report templates">
      {error ? <p className="form-error" role="alert">{templateErrorMessages[error]}</p> : null}
      {notice ? <p className="muted">{templateNoticeMessages[notice]}</p> : null}

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>ARS report templates</h2>
            <p className="muted">
              A template is the shape of a report: its components, their weightages, and the
              words a mentor may choose from. A mentor cannot start a report until one exists.
            </p>
          </div>
          {total > 0 ? <p className="muted">{total} {total === 1 ? "template" : "templates"}</p> : null}
        </div>

        <form action={createTemplateAction} className="stack-form">
          <label htmlFor="template-name">Name</label>
          <input
            id="template-name"
            maxLength={120}
            name="name"
            placeholder="Application Readiness — Final Assessment"
            required
            type="text"
          />
          <p className="muted">
            Leave the programme blank for a template any programme may use.
          </p>
          <button className="button button--primary" type="submit">Create template</button>
        </form>
      </section>

      <section className="panel">
        {rows.length === 0 ? (
          <p className="muted">No template yet. Create one above.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Programme</th>
                <th scope="col">Components</th>
                <th scope="col">Weightage</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.courseTitle ?? <span className="muted">Any programme</span>}</td>
                  <td>{row.componentCount}</td>
                  <td>
                    {row.weightageTotal}%{" "}
                    {row.weightageTotal === 100 ? (
                      <span className="pill">Ready</span>
                    ) : (
                      // A template that does not total 100 cannot be released
                      // against, so the list says so rather than letting a
                      // mentor discover it at the end of writing a report.
                      <span className="pill pill--disabled">Incomplete</span>
                    )}
                  </td>
                  <td>{row.isActive ? "Active" : "Inactive"}</td>
                  <td>
                    <Link href={`/admin/report-templates/${row.id}`}>Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pageCount > 1 ? (
          <nav aria-label="Pagination" className="pagination">
            {page > 1 ? (
              <Link href={buildTemplatesHref({ page: page - 1 })} rel="prev">Previous</Link>
            ) : (
              <span className="muted">Previous</span>
            )}
            <span className="muted">Page {page} of {pageCount}</span>
            {page < pageCount ? (
              <Link href={buildTemplatesHref({ page: page + 1 })} rel="next">Next</Link>
            ) : (
              <span className="muted">Next</span>
            )}
          </nav>
        ) : null}
      </section>
    </RoleShell>
  );
}
