"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { applyDefaultMarks, attachFigures, matchSection, parseDefaultMarks, reviewProblems } from "../import-review";
import { parseImportedQuestions, type StagedQuestion } from "../import-spec";
import { initialQuestionImportState, parseBatchId, type QuestionImportState } from "../import-state";
import { parseId } from "../list-params";
import { draftToFormValues, readQuestionForm, type QuestionEditorState } from "../question-form";
import { toSaveQuestionArgs, validateQuestion } from "../question-input";
import { readQuestionsWithGemini } from "../gemini";
import { type ModelFigure } from "../model-call";
import { readQuestionsWithOpenAiCompatible } from "../openai-compatible";
import { findDuplicates } from "../queries/find-duplicates";
import { listSections } from "../queries/list-sections";
import { isQuestionImagePath, questionImagesBucket } from "../storage";

// Importing questions: read a pasted answer, stage it, then approve or reject
// each question.
//
// Admin-only throughout, matching the policies on `question_imports`: Annexure A
// puts an admin's review between an import and the live bank.
//
// Reading a paste writes nothing. Staging re-parses the pasted text on the
// server rather than trusting the preview the browser sends back, because a
// Server Action is a public endpoint and the preview is only a form field.

function readPaste(formData: FormData): string {
  const raw = formData.get("pasted");
  // Bounded before parsing. Two hundred questions with solutions fit well
  // inside this; a megabyte of text is not a question paper.
  return typeof raw === "string" ? raw.slice(0, 500_000) : "";
}

// The images the Word step put in the bucket, as "3:org/1/questions/<uuid>.png".
//
// A Server Action is a public endpoint, so this is a post like any other and
// none of it is trusted: a number outside the range is dropped, and a path is
// kept only if it is one this organisation could legally hold. That is the same
// check `validateQuestion` applies at approval, run early so a crafted post
// cannot put another organisation's path on a staged row in the first place.
//
// It cannot prove the object exists -- only that the path is well formed and in
// the caller's own organisation. The Storage policies are what stop a path being
// readable, and a path naming nothing simply shows no image.
const maxFigureNumber = 300;

function readFigurePaths(formData: FormData, orgId: number): Record<number, string> {
  const paths: Record<number, string> = {};
  for (const value of formData.getAll("figures")) {
    if (typeof value !== "string") continue;
    const match = value.match(/^([0-9]{1,3}):(.+)$/);
    if (!match) continue;
    const n = Number(match[1]);
    if (!Number.isInteger(n) || n < 1 || n > maxFigureNumber) continue;
    if (!isQuestionImagePath(match[2], orgId)) continue;
    paths[n] = match[2];
  }
  return paths;
}

function readDocumentName(formData: FormData): string {
  const raw = formData.get("documentName");
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").slice(0, 200) : "";
}

export async function previewQuestionImportAction(
  _state: QuestionImportState,
  formData: FormData,
): Promise<QuestionImportState> {
  const admin = await requireRole("admin");

  const pasted = readPaste(formData);
  const defaultMarks = typeof formData.get("defaultMarks") === "string" ? String(formData.get("defaultMarks")) : "";
  if (pasted.trim() === "") return { ...initialQuestionImportState, problems: ["Paste the model's answer first."] };

  const figurePaths = readFigurePaths(formData, admin.orgId);
  const { documentName, items, problems } = parseImportedQuestions(pasted);
  return {
    defaultMarks,
    documentName: readDocumentName(formData) || documentName || "",
    items:
      problems.length === 0
        ? items.map((item) => (item.parsed ? { ...item, parsed: attachFigures(item.parsed, figurePaths) } : item))
        : null,
    pasted,
    problems,
  };
}

// The Gemini path: the platform reads the paper itself.
//
// What the browser sends is small -- the extracted text and the figure *paths*,
// never the pictures. The bytes are already in Storage, so the server fetches
// them from there under the admin's own session. That keeps the whole feature
// clear of the Vercel request-body cap, and it means the
// `question_images_select_author` policy is what decides whether this admin may
// read the picture at all.
//
// The answer lands in the same paste box the manual path fills, so preview,
// staging, review and approval are all the code that already exists and is
// already verified. This adds a way of filling that box, not a second pipeline.
const imageTypeByExtension: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function askGeminiAction(
  _state: QuestionImportState,
  formData: FormData,
): Promise<QuestionImportState> {
  const admin = await requireRole("admin");

  const raw = formData.get("documentText");
  const text = typeof raw === "string" ? raw.slice(0, 500_000) : "";
  const rawDefault = formData.get("defaultMarks");
  const documentName = readDocumentName(formData);
  const figurePaths = readFigurePaths(formData, admin.orgId);
  const echo = {
    defaultMarks: typeof rawDefault === "string" ? rawDefault : "",
    documentName,
    items: null,
    pasted: "",
  };

  if (text.trim() === "") {
    return { ...echo, problems: ["There is no document text to send. Open a Word file first."], usage: null };
  }
  const defaultMarks = parseDefaultMarks(rawDefault);
  if (defaultMarks === null) {
    return { ...echo, problems: ["Default marks must be a number above 0 and at most 100, or left blank."], usage: null };
  }

  // The pictures, read back out of the bucket as this admin.
  const supabase = await createServerSupabaseClient();
  const figures: ModelFigure[] = [];
  for (const [n, path] of Object.entries(figurePaths).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const { data, error } = await supabase.storage.from(questionImagesBucket).download(path);
    if (error || !data) continue;
    const mimeType = imageTypeByExtension[path.split(".").pop() ?? ""];
    if (!mimeType) continue;
    figures.push({
      base64: Buffer.from(await data.arrayBuffer()).toString("base64"),
      mimeType,
      n: Number(n),
    });
  }

  // The only place a model key is read. This file is "use server", so it cannot
  // reach a client bundle and no key can travel with it.
  //
  // Gemini is the production path. MODEL_BASE_URL switches to any provider
  // speaking the OpenAI chat-completions shape, which exists so the code can be
  // exercised against a free tier -- and a free tier must never see a real
  // Cospire paper, for the reason set out in model-call.ts.
  const { json, problems, usage } = process.env.MODEL_BASE_URL
    ? await readQuestionsWithOpenAiCompatible({
        apiKey: process.env.MODEL_API_KEY,
        baseUrl: process.env.MODEL_BASE_URL,
        figures,
        label: process.env.MODEL_LABEL || undefined,
        model: process.env.MODEL_NAME || undefined,
        text,
      })
    : await readQuestionsWithGemini({
        apiKey: process.env.GEMINI_API_KEY,
        figures,
        model: process.env.GEMINI_MODEL || undefined,
        text,
      });
  if (!json) return { ...echo, problems, usage };

  const outcome = parseImportedQuestions(json);
  if (outcome.problems.length > 0) {
    // The answer is handed back even so, because the admin can read it, fix it
    // and send it through the ordinary paste box rather than pay for a second
    // call.
    return { ...echo, pasted: json, problems: outcome.problems, usage };
  }

  return {
    defaultMarks: typeof rawDefault === "string" ? rawDefault : "",
    documentName: documentName || outcome.documentName || "",
    items: outcome.items.map((item) => (item.parsed ? { ...item, parsed: attachFigures(item.parsed, figurePaths) } : item)),
    pasted: json,
    problems: [],
    usage,
  };
}

export async function stageQuestionImportAction(
  _state: QuestionImportState,
  formData: FormData,
): Promise<QuestionImportState> {
  const admin = await requireRole("admin");

  const pasted = readPaste(formData);
  const rawDefault = formData.get("defaultMarks");
  const defaultMarks = parseDefaultMarks(rawDefault);
  const documentName = readDocumentName(formData);
  const echo = {
    defaultMarks: typeof rawDefault === "string" ? rawDefault : "",
    documentName,
    items: null,
    pasted,
  };

  if (defaultMarks === null) {
    return { ...echo, problems: ["Default marks must be a number above 0 and at most 100, or left blank."] };
  }

  const outcome = parseImportedQuestions(pasted);
  if (outcome.problems.length > 0 || outcome.items.length === 0) {
    return { ...echo, problems: outcome.problems.length > 0 ? outcome.problems : ["There is nothing to import."] };
  }

  const sections = await listSections();
  const figurePaths = readFigurePaths(formData, admin.orgId);
  const batchId = randomUUID();

  const rows = outcome.items.map((item) => {
    const parsed: StagedQuestion | null = item.parsed
      ? attachFigures(applyDefaultMarks(item.parsed, defaultMarks), figurePaths)
      : null;
    const sectionId = parsed ? matchSection(parsed.sectionName, sections) : null;
    // The parser's own findings win where it has any; otherwise the same
    // validator approval uses says what is left to fix, marks included.
    const problems =
      item.problems.length > 0 ? item.problems : parsed ? reviewProblems(parsed, sectionId, admin.orgId) : [];
    return {
      batch_id: batchId,
      org_id: admin.orgId,
      parsed,
      position: item.position,
      problems,
      raw: item.raw,
      source_ref: documentName || outcome.documentName || null,
      source_type: "paste",
    };
  });

  // Whether the bank already holds each question (D22-D24), decided once here
  // and stored with the row, so the review screen shows it without asking again.
  let verdicts: Awaited<ReturnType<typeof findDuplicates>>;
  try {
    verdicts = await findDuplicates(rows);
  } catch {
    return { ...echo, problems: ["The questions could not be compared with the bank. Nothing was saved; try again."] };
  }
  for (const row of rows) {
    const verdict = verdicts.get(row.position);
    if (row.parsed && verdict) row.parsed = { ...row.parsed, duplicate: verdict };
  }

  const supabase = await createServerSupabaseClient();
  // One statement, so a batch is staged whole or not at all.
  const { data, error } = await supabase.from("question_imports").insert(rows).select("id");

  if (error || !data || data.length !== rows.length) {
    return { ...echo, problems: ["The questions could not be staged. Nothing was saved."] };
  }

  revalidatePath("/admin/questions/import");
  redirect(`/admin/questions/import/${batchId}`);
}

function describeApproveError(error: { code?: string; message?: string }): string {
  if (error.code === "P0002") return "This question has already been decided, or could not be found.";
  const message = error.message ?? "";
  if (error.code === "23514" && !/violates check constraint/.test(message)) {
    return message.charAt(0).toUpperCase() + message.slice(1) + ".";
  }
  return "The question could not be approved. Check every field and try again.";
}

export async function approveImportAction(
  _state: QuestionEditorState,
  formData: FormData,
): Promise<QuestionEditorState> {
  const admin = await requireRole("admin");
  const importId = parseId(formData.get("importId"));
  const { draft } = readQuestionForm(formData);
  const values = draftToFormValues(draft);
  if (importId === null) return { problems: ["That request was not valid."], values };

  const supabase = await createServerSupabaseClient();
  const { data: row, error: readError } = await supabase
    .from("question_imports")
    .select("id, batch_id, parsed, status")
    .eq("id", importId)
    .maybeSingle();

  if (readError || !row) return { problems: ["That import could not be found."], values };
  if (row.status !== "pending_review") return { problems: ["This question has already been decided."], values };

  const staged = row.parsed as StagedQuestion | null;
  if (!staged) return { problems: ["This entry could not be read as a question. Reject it."], values };

  // The type and the set a question belongs to come from the staged row, never
  // from the form: the editor does not offer either, so a post that changes
  // them was not made through it.
  draft.type = staged.type;
  draft.parentId = null;

  if (staged.parentPosition !== null) {
    const { data: setRow } = await supabase
      .from("question_imports")
      .select("status, question_id")
      .eq("batch_id", row.batch_id)
      .eq("position", staged.parentPosition)
      .maybeSingle();
    if (!setRow || setRow.status !== "approved" || setRow.question_id === null) {
      return { problems: ["Approve this question's DI set passage first."], values };
    }
    const { data: parent } = await supabase
      .from("questions")
      .select("id, section_id")
      .eq("id", setRow.question_id)
      .maybeSingle();
    if (!parent) return { problems: ["The DI set this question belongs to could not be found."], values };
    draft.parentId = Number(parent.id);
    draft.sectionId = Number(parent.section_id);
  }

  const { problems, question } = validateQuestion(draft, admin.orgId);
  if (!question) return { problems, values };

  // "Corrected version" (D24): the reviewed question replaces an existing one's
  // content instead of becoming a new question. Only a bank question the
  // staging verdict offered, of the same type and still active, may be named:
  // the form is a public endpoint and a stray id must not overwrite anything.
  const intoRaw = formData.get("intoQuestionId");
  if (intoRaw !== null && intoRaw !== "") {
    const intoId = parseId(intoRaw);
    const offered =
      staged.duplicate?.kind === "possible"
        ? staged.duplicate.candidates.flatMap((candidate) => (candidate.source === "bank" ? [candidate.questionId] : []))
        : [];
    if (intoId === null || !offered.includes(intoId) || staged.parentPosition !== null) {
      return { problems: ["That question cannot be corrected from here."], values };
    }
    const { data: target } = await supabase.from("questions").select("id, type, parent_id, archived_at").eq("id", intoId).maybeSingle();
    if (!target || target.archived_at !== null || target.type !== staged.type || target.parent_id !== null) {
      return { problems: ["That question is archived, part of a set, or of a different type, so it cannot take this version."], values };
    }
    const { error: intoError } = await supabase.rpc("approve_question_import_into", {
      ...toSaveQuestionArgs(question, intoId),
      p_import_id: importId,
      p_question_id: intoId,
    });
    if (intoError) return { problems: [describeApproveError(intoError)], values };
    revalidatePath("/admin/questions");
    redirect(`/admin/questions/import/${row.batch_id}?notice=corrected#import-${importId}`);
  }

  // approve_question_import always creates, so it takes no question id.
  const args: Record<string, unknown> = { ...toSaveQuestionArgs(question, null), p_import_id: importId };
  delete args.p_question_id;
  const { error } = await supabase.rpc("approve_question_import", args);
  if (error) return { problems: [describeApproveError(error)], values };

  revalidatePath("/admin/questions");
  redirect(`/admin/questions/import/${row.batch_id}?notice=approved#import-${importId}`);
}

// The existing questions a staged row may be linked to without creating
// anything (D24 "same question"): the exact match staging found, any bank
// candidate it flagged, or what an earlier repeat of it in this paper became.
function linkTargets(staged: StagedQuestion | null, questionIdAt: (position: number) => number | null): number[] {
  const verdict = staged?.duplicate;
  if (!staged || !verdict) return [];
  if (verdict.kind === "same") return [verdict.questionId];
  if (verdict.kind === "repeat") {
    const earlier = questionIdAt(verdict.position);
    return earlier === null ? [] : [earlier];
  }
  // A flagged sub-question is never linked on its own: a set links whole.
  if (verdict.kind === "possible" && staged.parentPosition === null) {
    return verdict.candidates.flatMap((candidate) => {
      if (candidate.source === "bank") return [candidate.questionId];
      const earlier = questionIdAt(candidate.position);
      return earlier === null ? [] : [earlier];
    });
  }
  return [];
}

type SessionClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

async function linkRow(supabase: SessionClient, importId: number, questionId: number): Promise<boolean> {
  const { data: target } = await supabase.from("questions").select("id, archived_at").eq("id", questionId).maybeSingle();
  if (!target || target.archived_at !== null) return false;
  // Allowed by the existing grant on (status, question_id); the guard stamps
  // who decided and when, and refuses a row already decided.
  const { data, error } = await supabase
    .from("question_imports")
    .update({ question_id: questionId, status: "approved" })
    .eq("id", importId)
    .eq("status", "pending_review")
    .select("id");
  return !error && (data ?? []).length === 1;
}

async function readBatchRows(supabase: SessionClient, batchId: string) {
  const { data, error } = await supabase
    .from("question_imports")
    .select("id, position, parsed, problems, status, question_id")
    .eq("batch_id", batchId)
    .order("position");
  if (error) throw new Error(`Unable to read the import: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    parsed: (row.parsed ?? null) as StagedQuestion | null,
    position: Number(row.position),
    problems: Array.isArray(row.problems) ? row.problems.map(String) : [],
    questionId: row.question_id === null ? null : Number(row.question_id),
    status: String(row.status),
  }));
}

// "Same question": approve a staged row as an existing question.
export async function linkImportAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const importId = parseId(formData.get("importId"));
  const batchId = parseBatchId(formData.get("batchId"));
  const questionId = parseId(formData.get("questionId"));
  if (importId === null || batchId === null || questionId === null) redirect("/admin/questions/import");

  const supabase = await createServerSupabaseClient();
  const rows = await readBatchRows(supabase, batchId);
  const row = rows.find((entry) => entry.id === importId);
  const questionIdAt = (position: number) => rows.find((entry) => entry.position === position && entry.status === "approved")?.questionId ?? null;
  const ok = row !== undefined && linkTargets(row.parsed, questionIdAt).includes(questionId) && (await linkRow(supabase, importId, questionId));

  revalidatePath("/admin/questions");
  redirect(`/admin/questions/import/${batchId}?notice=${ok ? "linked" : "failed"}#import-${importId}`);
}

// Approves everything that needs no decision, in paper order: every question
// with no problems that is new, already in the bank, or a repeat of one before
// it. A flagged question ("possibly the same as …") is always left for a person
// (O3), as is anything with a problem to fix. A DI set's passage comes before
// its sub-questions in the paper, so they have a set to join.
export async function approveAllCleanAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const batchId = parseBatchId(formData.get("batchId"));
  if (batchId === null) redirect("/admin/questions/import");

  const supabase = await createServerSupabaseClient();
  const [rows, sections] = await Promise.all([readBatchRows(supabase, batchId), listSections()]);
  const decided = new Map(rows.filter((row) => row.status === "approved").map((row) => [row.position, row.questionId]));
  const questionIdAt = (position: number) => decided.get(position) ?? null;
  let done = 0;

  for (const row of rows) {
    const staged = row.parsed;
    if (row.status !== "pending_review" || !staged || row.problems.length > 0) continue;
    const verdict = staged.duplicate ?? { kind: "new" as const };
    if (verdict.kind === "possible") continue;

    if (verdict.kind === "same" || verdict.kind === "repeat") {
      const target = linkTargets(staged, questionIdAt)[0];
      if (target !== undefined && (await linkRow(supabase, row.id, target))) {
        decided.set(row.position, target);
        done += 1;
      }
      continue;
    }

    // New: approved as staged, exactly as the editor would with nothing changed.
    let parentId: number | null = null;
    let sectionId = matchSection(staged.sectionName, sections);
    if (staged.parentPosition !== null) {
      parentId = questionIdAt(staged.parentPosition);
      if (parentId === null) continue;
      const { data: parent } = await supabase.from("questions").select("section_id").eq("id", parentId).maybeSingle();
      if (!parent) continue;
      sectionId = Number(parent.section_id);
    }
    const { question } = validateQuestion(
      {
        accepted: staged.accepted,
        body: staged.body,
        correctOptions: staged.correctOptions,
        difficulty: staged.difficulty,
        images: staged.images ?? [],
        marks: staged.marks,
        options: staged.options,
        parentId,
        sectionId,
        solution: staged.solution,
        tolerance: staged.tolerance,
        topic: staged.topic,
        type: staged.type,
      },
      admin.orgId,
    );
    if (!question) continue;
    const args: Record<string, unknown> = { ...toSaveQuestionArgs(question, null), p_import_id: row.id };
    delete args.p_question_id;
    const { data: savedId, error } = await supabase.rpc("approve_question_import", args);
    if (error || savedId === null) continue;
    decided.set(row.position, Number(savedId));
    done += 1;
  }

  revalidatePath("/admin/questions");
  redirect(`/admin/questions/import/${batchId}?notice=${done > 0 ? "bulk" : "bulk-none"}`);
}

export async function rejectImportAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const importId = parseId(formData.get("importId"));
  const batchId = parseBatchId(formData.get("batchId"));
  if (importId === null || batchId === null) redirect("/admin/questions/import");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("question_imports")
    .update({ status: "rejected" })
    .eq("id", importId)
    .eq("status", "pending_review")
    .select("id");

  const ok = !error && data && data.length === 1;
  redirect(`/admin/questions/import/${batchId}?notice=${ok ? "rejected" : "failed"}`);
}

// Clears what is still undecided. Approved rows stay, as the record of where
// each imported question came from.
export async function discardPendingAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const batchId = parseBatchId(formData.get("batchId"));
  if (batchId === null) redirect("/admin/questions/import");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("question_imports")
    .delete()
    .eq("batch_id", batchId)
    .in("status", ["pending_review", "rejected"]);

  revalidatePath("/admin/questions/import");
  redirect(error ? `/admin/questions/import/${batchId}?notice=failed` : "/admin/questions/import?notice=discarded");
}
