"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { parseId } from "@/features/question-bank/list-params";
import { createAdminSupabaseClient } from "@/shared/db/supabase/admin";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { readAnswer } from "../answer";
import { attemptDeadline } from "../clock";
import { isPhone } from "../device";
import { nextSection, paperState } from "../paper";
import { getAttemptView } from "../queries/attempt-view";
import { scoreAndStore } from "../score-attempt";

function idFrom(formData: FormData, name: string): number | null {
  const raw = formData.get(name);
  return parseId(typeof raw === "string" ? raw : undefined);
}

// Starting a mock. The database writes the clock, counts the attempts and
// refuses a phone where the mock bars one; this only decides what to tell the
// student. The device is read from the request here, on the server, and a phone
// attempt is marked unproctored for good (operating manual §1.5).
export async function startAttemptAction(formData: FormData): Promise<void> {
  const student = await requireRole("student");
  const mockId = idFrom(formData, "mockId");
  if (mockId === null) redirect("/student/mocks");

  const phone = isPhone((await headers()).get("user-agent"));
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("attempts")
    .insert({ mock_id: mockId, org_id: student.orgId, proctored: !phone, student_id: student.id })
    .select("id")
    .single();

  if (error?.code === "23505") {
    // One is already open: resume it rather than refuse.
    const { data: open } = await supabase
      .from("attempts")
      .select("id")
      .eq("mock_id", mockId)
      .eq("status", "in_progress")
      .maybeSingle();
    if (open) redirect(`/student/attempts/${open.id}`);
  }
  if (error || !data) {
    const reason = error?.message.includes("phone") ? "phone" : error?.message.includes("attempt") ? "limit" : "failed";
    redirect(`/student/mocks/${mockId}?error=${reason}`);
  }

  // A sectioned paper opens on its first section straight away, so the first
  // screen is a question rather than a button.
  const view = await getAttemptView(data.id);
  if (view) {
    const state = paperState(view.sections, view.entered, new Date(view.attempt.startedAt), view.mock.durationMinutes, new Date());
    if (state.kind === "enter") {
      await supabase.from("attempt_sections").insert({ attempt_id: data.id, mock_section_id: state.sectionId });
    }
  }
  redirect(`/student/attempts/${data.id}`);
}

// Save the answer on screen, then move. Every navigation button posts through
// here, so nothing typed is lost to a click, with or without JavaScript.
export async function saveAnswerAction(formData: FormData): Promise<void> {
  await requireRole("student");
  const attemptId = idFrom(formData, "attemptId");
  const questionId = idFrom(formData, "questionId");
  if (attemptId === null) redirect("/student/mocks");
  const back = `/student/attempts/${attemptId}`;

  const view = await getAttemptView(attemptId);
  if (!view) redirect("/student/mocks");
  const question = questionId === null ? undefined : view.questions.get(questionId);
  const intent = String(formData.get("intent") ?? "");
  const goto = Number(formData.get("goto"));

  if (question && view.attempt.status === "in_progress") {
    const answer = intent === "clear" ? null : readAnswer(question, formData.getAll("answer").map(String));
    if (answer === "invalid") {
      const number = view.items.find((item) => item.questionId === question.id)?.number ?? 1;
      redirect(`${back}?q=${number}&error=invalid`);
    }

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("attempt_responses").upsert(
      {
        answer,
        attempt_id: attemptId,
        marked_for_review: formData.get("review") === "on",
        question_id: question.id,
      },
      { onConflict: "attempt_id,question_id" },
    );
    // Refused by the database: the clock or the section ran out. The attempt
    // screen then shows what is actually still open.
    if (error) redirect(`${back}?error=closed`);
  }

  if (intent === "submit") redirect(`${back}?confirm=submit`);
  if (intent === "leave") redirect(`${back}?confirm=leave`);
  // The countdown reached zero: the answer on screen is saved (inside the
  // grace), and the page carries straight on.
  if (intent === "timeup") redirect(`${back}?auto=1`);
  const current = Number(formData.get("current"));
  const target = Number.isSafeInteger(goto) && goto > 0 ? goto : Number.isSafeInteger(current) && current > 0 ? current : null;
  redirect(target ? `${back}?q=${target}` : back);
}

// Leaving the current section early, or entering the next once it is over.
export async function nextSectionAction(formData: FormData): Promise<void> {
  await requireRole("student");
  const attemptId = idFrom(formData, "attemptId");
  if (attemptId === null) redirect("/student/mocks");
  const back = `/student/attempts/${attemptId}`;

  const view = await getAttemptView(attemptId);
  if (!view || view.attempt.status !== "in_progress") redirect(back);

  const supabase = await createServerSupabaseClient();
  const state = paperState(view.sections, view.entered, new Date(view.attempt.startedAt), view.mock.durationMinutes, new Date());
  let target: number | null = null;
  if (state.kind === "open" && state.sectionId !== null) {
    await supabase
      .from("attempt_sections")
      .update({ submitted_at: new Date().toISOString() })
      .eq("attempt_id", attemptId)
      .eq("mock_section_id", state.sectionId);
    target = nextSection(view.sections, state.sectionId)?.id ?? null;
  } else if (state.kind === "enter") {
    target = state.sectionId;
  }
  if (target !== null) {
    await supabase.from("attempt_sections").insert({ attempt_id: attemptId, mock_section_id: target });
  }
  redirect(back);
}

// Submitting, by hand or because the countdown reached zero. After the paper's
// clock has run out the attempt is closed as the timer's, at the moment it ran
// out, rather than as the student's at whatever time they came back.
export async function submitAttemptAction(formData: FormData): Promise<void> {
  await requireRole("student");
  const attemptId = idFrom(formData, "attemptId");
  if (attemptId === null) redirect("/student/mocks");
  const back = `/student/attempts/${attemptId}`;

  // Read through the student's own session: this is the ownership check that
  // every server-key write below relies on.
  const view = await getAttemptView(attemptId);
  if (!view) redirect("/student/mocks");

  if (view.attempt.status === "in_progress") {
    const started = new Date(view.attempt.startedAt);
    const deadline = attemptDeadline(started, view.mock.durationMinutes);
    const state = paperState(view.sections, view.entered, started, view.mock.durationMinutes, new Date());
    if (state.kind === "over" && Date.now() > deadline.getTime()) {
      await createAdminSupabaseClient()
        .from("attempts")
        .update({ status: "submitted", submitted_at: deadline.toISOString(), submitted_by: "timer" })
        .eq("id", attemptId)
        .eq("status", "in_progress");
    } else {
      const supabase = await createServerSupabaseClient();
      await supabase.from("attempts").update({ status: "submitted" }).eq("id", attemptId).eq("status", "in_progress");
    }
  }

  // Re-read: a failed close must not be scored or reported as done.
  const closed = await getAttemptView(attemptId);
  if (!closed || closed.attempt.status !== "submitted") redirect(`${back}?error=submit`);
  await scoreAndStore(attemptId);
  redirect(back);
}
