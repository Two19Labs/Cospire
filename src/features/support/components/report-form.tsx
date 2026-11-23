"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/shared/ui";

import { fileReportAction } from "../actions";
import { initialReportState, maxComment, type ReportKind } from "../support";

// One form for both kinds: the Help page's ticket and the button's mistake
// report. The page travels as a hidden field; the server normalises it and
// takes the reporter from the session.
export function ReportForm({ kind, page }: { kind: ReportKind; page: string }) {
  const [state, action] = useActionState(fileReportAction, initialReportState);

  if (state.sent) {
    return (
      <p className="notice notice--success" role="status">
        {kind === "ticket"
          ? "Your ticket is with the Cospire team. They will look into it."
          : "Thank you. The Cospire team will check it and correct it."}
      </p>
    );
  }

  const id = `report-${kind}`;
  return (
    <form action={action} className="stack-form">
      <input name="kind" type="hidden" value={kind} />
      <input name="page" type="hidden" value={page} />
      <label className="field" htmlFor={id}>
        <span className="field__label">{kind === "ticket" ? "What is going wrong?" : "What is the mistake?"}</span>
        <textarea
          className="input"
          id={id}
          maxLength={maxComment}
          name="comment"
          placeholder={
            kind === "ticket"
              ? "What you were doing, what happened, and on which device."
              : "Which question or item, and what looks wrong."
          }
          required
          rows={5}
        />
      </label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <SubmitButton pendingLabel="Sending…">{kind === "ticket" ? "Raise ticket" : "Send report"}</SubmitButton>
    </form>
  );
}
