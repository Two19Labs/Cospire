import Link from "next/link";

import type { Profile } from "@/features/auth/types";
import { RoleShell } from "@/features/auth/components/role-shell";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { markSubmissionReviewedAction } from "../actions/review-actions";
import type { MentorSubmissionDetail, ReviewAnswer } from "../queries/mentor-submissions";

function upload(value: unknown): { originalName: string; storagePath: string } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  return typeof item.storagePath === "string" && typeof item.originalName === "string"
    ? { storagePath: item.storagePath, originalName: item.originalName } : null;
}

async function Answer({ answer }: { answer: ReviewAnswer }) {
  const file = upload(answer.value);
  if (file) {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.storage.from("ars-uploads").createSignedUrl(file.storagePath, 300, { download: file.originalName });
    return <p>{data?.signedUrl ? <a href={data.signedUrl}>{file.originalName}</a> : "File unavailable"}</p>;
  }
  if (typeof answer.value === "object" && answer.value !== null) {
    return <ul>{Object.entries(answer.value as Record<string, unknown>).map(([key, value]) => <li key={key}><strong>{key}:</strong> {String(value)}</li>)}</ul>;
  }
  return <p className="review-answer__value">{typeof answer.value === "boolean" ? (answer.value ? "Yes" : "No") : String(answer.value)}</p>;
}

export function MentorReviewDetail({ profile, submission, notice, error }: { profile: Profile; submission: MentorSubmissionDetail; notice?: string; error?: string }) {
  return (
    <RoleShell profile={profile} title="Review submission">
      <section className="panel">
        <Link href="/mentor">← Review queue</Link>
        {notice === "reviewed" ? <p className="notice notice--success">Submission marked as reviewed.</p> : null}
        {error ? <p className="notice notice--error">The review could not be saved. Please try again.</p> : null}
        <div className="panel__header"><div><h2>{submission.studentName}</h2><p className="muted">{submission.courseTitle} · {submission.roundName} · attempt {submission.attemptNo}{submission.isLate ? " · submitted late" : ""}</p></div><span className="pill">{submission.status === "submitted" ? "Waiting" : "Reviewed"}</span></div>
        <div className="review-answers">
          {submission.answers.length ? submission.answers.map((answer) => <article className="review-answer" key={answer.field.key}><h3>{answer.field.label}</h3><Answer answer={answer} /></article>) : <p className="muted">This off-platform round was recorded as completed; it has no student answers.</p>}
        </div>
        {submission.status === "submitted" ? <form action={markSubmissionReviewedAction}><input name="submissionId" type="hidden" value={submission.id} /><button className="button button--primary" type="submit">Mark reviewed</button></form> : <p className="muted">Reviewed {submission.reviewedAt?.slice(0, 10)}</p>}
      </section>
    </RoleShell>
  );
}
