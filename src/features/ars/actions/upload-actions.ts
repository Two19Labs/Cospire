"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { allFields, toFormSpec, type FormField, type RoundMode } from "../form-schema";
import { parseRoundId } from "../list-params";
import {
  arsUploadMaxBytes,
  arsUploadMimeExtensions,
  arsUploadsBucket,
  buildArsUploadPath,
  isStoredArsUpload,
  type StoredArsUpload,
} from "../upload";

type UploadFailure = { error: string; ok: false };
type PrepareResult = UploadFailure | { ok: true; path: string };
type RecordResult = UploadFailure | { oldPath: string | null; ok: true };
type RemoveResult = UploadFailure | { ok: true; path: string };

async function loadFileField(roundId: number, fieldKey: string): Promise<{
  field: FormField;
  orgId: number;
} | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ars_rounds")
    .select("org_id, submission_mode, config")
    .eq("id", roundId)
    .maybeSingle();
  if (error || !data) return null;
  const spec = toFormSpec(data.config, data.submission_mode as RoundMode);
  const field = spec ? allFields(spec).find((entry) => entry.key === fieldKey) : undefined;
  return field?.type === "file" ? { field, orgId: data.org_id } : null;
}

async function getOrCreateDraft(roundId: number, orgId: number, studentId: string) {
  const supabase = await createServerSupabaseClient();
  const existing = await supabase
    .from("ars_submissions")
    .select("id, answer, status")
    .eq("round_id", roundId)
    .order("attempt_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) return null;
  if (existing.data) return existing.data.status === "draft" ? existing.data : null;

  const inserted = await supabase
    .from("ars_submissions")
    .insert({ answer: {}, org_id: orgId, round_id: roundId, status: "draft", student_id: studentId })
    .select("id, answer, status")
    .single();
  return inserted.error ? null : inserted.data;
}

function validOriginalName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 255 ? trimmed : null;
}

export async function prepareArsUploadAction(input: {
  fieldKey: string;
  mimeType: string;
  originalName: string;
  roundId: number;
  size: number;
}): Promise<PrepareResult> {
  const student = await requireRole("student");
  if (!input || typeof input !== "object") return { error: "That upload request is invalid.", ok: false };
  const roundId = parseRoundId(String(input.roundId));
  if (roundId === null || !/^[a-z][a-z0-9_]{0,63}$/.test(input.fieldKey)) {
    return { error: "That upload request is invalid.", ok: false };
  }
  const loaded = await loadFileField(roundId, input.fieldKey);
  const extension = arsUploadMimeExtensions[input.mimeType];
  const originalName = validOriginalName(input.originalName);
  const accepted = loaded?.field.accept ?? Object.values(arsUploadMimeExtensions);
  if (!loaded || !extension || !accepted.includes(extension)) {
    return { error: "That file type is not allowed for this question.", ok: false };
  }
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > arsUploadMaxBytes) {
    return { error: "Choose a non-empty file smaller than 50 MB.", ok: false };
  }
  if (!originalName) return { error: "That file name is invalid.", ok: false };
  if (!(await getOrCreateDraft(roundId, loaded.orgId, student.id))) {
    return { error: "This round can no longer be changed.", ok: false };
  }
  return {
    ok: true,
    path: buildArsUploadPath({
      extension,
      objectId: randomUUID(),
      orgId: loaded.orgId,
      studentId: student.id,
    }),
  };
}

export async function recordArsUploadAction(input: {
  fieldKey: string;
  mimeType: string;
  originalName: string;
  path: string;
  roundId: number;
  size: number;
}): Promise<RecordResult> {
  const student = await requireRole("student");
  if (!input || typeof input !== "object") return { error: "That upload request is invalid.", ok: false };
  const roundId = parseRoundId(String(input.roundId));
  if (roundId === null) return { error: "That upload request is invalid.", ok: false };
  const loaded = await loadFileField(roundId, input.fieldKey);
  const extension = arsUploadMimeExtensions[input.mimeType];
  const originalName = validOriginalName(input.originalName);
  const accepted = loaded?.field.accept ?? Object.values(arsUploadMimeExtensions);
  if (!loaded || !extension || !originalName || !accepted.includes(extension)) {
    return { error: "That uploaded file does not match this question.", ok: false };
  }
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > arsUploadMaxBytes) {
    return { error: "That uploaded file has an invalid size.", ok: false };
  }
  const expectedPrefix = `org/${loaded.orgId}/ars/${student.id}/`;
  if (typeof input.path !== "string" || !input.path.startsWith(expectedPrefix) || !input.path.endsWith(`.${extension}`)) {
    return { error: "That uploaded file is outside your private folder.", ok: false };
  }

  const supabase = await createServerSupabaseClient();
  const draft = await getOrCreateDraft(roundId, loaded.orgId, student.id);
  if (!draft) return { error: "This round can no longer be changed.", ok: false };
  const filename = input.path.slice(expectedPrefix.length);
  const listed = await supabase.storage.from(arsUploadsBucket).list(expectedPrefix.slice(0, -1), {
    limit: 2,
    search: filename,
  });
  const object = listed.data?.find((entry) => entry.name === filename);
  if (listed.error || !object) return { error: "The file did not finish uploading.", ok: false };
  const metadata = object.metadata as Record<string, unknown> | null;
  if (
    (typeof metadata?.size === "number" && metadata.size !== input.size) ||
    (typeof metadata?.mimetype === "string" && metadata.mimetype !== input.mimeType)
  ) {
    return { error: "The uploaded file does not match the file you selected.", ok: false };
  }

  const answer =
    typeof draft.answer === "object" && draft.answer !== null && !Array.isArray(draft.answer)
      ? { ...(draft.answer as Record<string, unknown>) }
      : {};
  const oldValue = answer[input.fieldKey];
  const oldPath = isStoredArsUpload(oldValue) ? oldValue.storagePath : null;
  const stored: StoredArsUpload = {
    mimeType: input.mimeType,
    originalName,
    size: input.size,
    storagePath: input.path,
  };
  answer[input.fieldKey] = stored;
  const updated = await supabase
    .from("ars_submissions")
    .update({ answer })
    .eq("id", draft.id)
    .eq("status", "draft")
    .select("id");
  if (updated.error || updated.data?.length !== 1) {
    return { error: "The upload could not be attached to your draft.", ok: false };
  }
  revalidatePath(`/student/ars/${roundId}`);
  return { ok: true, oldPath: oldPath === input.path ? null : oldPath };
}

export async function removeArsUploadAction(input: {
  fieldKey: string;
  roundId: number;
}): Promise<RemoveResult> {
  const student = await requireRole("student");
  if (!input || typeof input !== "object") return { error: "That upload request is invalid.", ok: false };
  const roundId = parseRoundId(String(input.roundId));
  if (roundId === null) return { error: "That upload request is invalid.", ok: false };
  const loaded = await loadFileField(roundId, input.fieldKey);
  if (!loaded) return { error: "That upload question no longer exists.", ok: false };
  const supabase = await createServerSupabaseClient();
  const draft = await getOrCreateDraft(roundId, loaded.orgId, student.id);
  if (!draft) return { error: "This round can no longer be changed.", ok: false };
  const answer =
    typeof draft.answer === "object" && draft.answer !== null && !Array.isArray(draft.answer)
      ? { ...(draft.answer as Record<string, unknown>) }
      : {};
  const stored = answer[input.fieldKey];
  if (!isStoredArsUpload(stored)) return { error: "There is no uploaded file to remove.", ok: false };
  delete answer[input.fieldKey];
  const updated = await supabase
    .from("ars_submissions")
    .update({ answer })
    .eq("id", draft.id)
    .eq("status", "draft")
    .select("id");
  if (updated.error || updated.data?.length !== 1) {
    return { error: "The file could not be removed from your draft.", ok: false };
  }
  revalidatePath(`/student/ars/${roundId}`);
  return { ok: true, path: stored.storagePath };
}
