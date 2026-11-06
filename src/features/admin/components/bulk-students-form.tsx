"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button, Input } from "@/shared/ui";

import { bulkCreateStudentsAction } from "../actions/bulk-create-students";
import { initialBulkCreateStudentsState } from "../actions/bulk-create-students-state";
import { bulkRowLimit } from "../bulk-students";

export function BulkStudentsForm() {
  const [state, action, pending] = useActionState(
    bulkCreateStudentsAction,
    initialBulkCreateStudentsState,
  );

  return (
    <form action={action} className="stack-form stack-form--wide">
      <Input
        accept=".csv,text/csv"
        label="Spreadsheet (CSV)"
        name="sheet"
        required
        type="file"
      />
      <p className="field__hint">
        A first row naming the columns <strong>name</strong> and{" "}
        <strong>email</strong>, then one student per row, up to {bulkRowLimit}.
        In Excel or Google Sheets, save or download it as CSV.
      </p>
      <p className="notice">
        Every row is checked first. If any row has a problem, nobody is created
        and the rows to fix are listed here. Otherwise each student gets an email
        from noreply@cospire.in with a link to set their own password.
      </p>

      {state.created > 0 ? (
        <p className="setup-notice" role="status">
          {state.created} student{state.created === 1 ? "" : "s"} created and
          invited by email.{" "}
          <Link href="/admin/users?view=list">See them in the user list.</Link>
        </p>
      ) : null}
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.problems.length > 0 ? (
        <div className="form-error" role="alert">
          <p>
            Nothing was created. Fix {state.problems.length === 1 ? "this row" : `these ${state.problems.length} rows`} and upload the sheet again:
          </p>
          <ul>
            {state.problems.map((problem) => (
              <li key={`${problem.row}-${problem.message}`}>
                Row {problem.row}: {problem.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="form-end">
        <Link className="button button--ghost" href="/admin/users?view=list">
          Cancel
        </Link>
        <Button disabled={pending} type="submit">
          {pending ? "Checking and inviting..." : "Upload and invite"}
        </Button>
      </div>
    </form>
  );
}
