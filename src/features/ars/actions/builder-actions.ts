"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import {
  addField,
  addPage,
  addSection,
  emptyForm,
  moveField,
  removeField,
  removePage,
  removeSection,
  renamePage,
  renameSection,
  setPageSubtitle,
  type BuildResult,
} from "../form-builder";
import { toFormSpec, type FormSpec, type RoundMode } from "../form-schema";
import { parseRoundId } from "../list-params";

// The round builder's write side.
//
// Each exported action is one click on that screen. They all funnel through
// `apply`, which loads the round, hands its form to a pure operation from
// `form-builder.ts`, and writes back only on success -- so a refused operation
// leaves the stored config exactly as it was.
//
// Written through the signed-in admin's own client, never the secret key, so
// `ars_rounds_update_admin` still decides who may write and to which
// organisation. Every argument is validated: a Server Action is a public HTTP
// endpoint and TypeScript's parameter types are erased at that boundary.

function builderHref(courseId: number, roundId: number, error?: string): string {
  const base = `/admin/ars/${courseId}/rounds/${roundId}`;
  return error ? `${base}?error=${encodeURIComponent(error.slice(0, 120))}` : base;
}

function readText(formData: FormData, key: string, limit = 200): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.slice(0, limit) : "";
}

function readIndex(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (typeof raw !== "string" || !/^[0-9]{1,3}$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

// A page or field key comes back from the page that rendered it, so it is
// checked against the same pattern the schema enforces rather than trusted.
function readKey(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  return typeof raw === "string" && /^[a-z][a-z0-9_]{0,48}$/.test(raw) ? raw : null;
}

async function apply(
  formData: FormData,
  operate: (spec: FormSpec) => BuildResult,
): Promise<never> {
  await requireRole("admin");

  const courseId = parseRoundId(readText(formData, "courseId", 20));
  const roundId = parseRoundId(readText(formData, "roundId", 20));
  if (courseId === null || roundId === null) redirect("/admin/courses");

  const supabase = await createServerSupabaseClient();
  const { data: round, error: readError } = await supabase
    .from("ars_rounds")
    .select("id, submission_mode, config")
    .eq("id", roundId)
    .maybeSingle();

  // RLS filters a round outside this admin's organisation to no row, which is
  // indistinguishable from a deleted one and is meant to be.
  if (readError || !round) redirect(builderHref(courseId, roundId, "That round no longer exists."));

  const existing =
    toFormSpec(round.config, round.submission_mode as RoundMode) ?? emptyForm;

  const result = operate(existing);
  if (!result.ok) redirect(builderHref(courseId, roundId, result.message));

  // The prompt is preserved. It predates this format and is still shown above
  // the form, so a builder edit must not silently discard it.
  const previousPrompt =
    typeof round.config === "object" && round.config !== null && !Array.isArray(round.config)
      ? (round.config as Record<string, unknown>).prompt
      : undefined;

  const { data, error } = await supabase
    .from("ars_rounds")
    .update({
      config: {
        ...(typeof previousPrompt === "string" ? { prompt: previousPrompt } : {}),
        steps: result.spec.steps,
      },
    })
    .eq("id", roundId)
    .select("id");

  // Row count, not the absence of an error: RLS filters a disallowed update to
  // zero rows and PostgREST reports success.
  if (error || (data ?? []).length !== 1) {
    redirect(builderHref(courseId, roundId, "That change could not be saved."));
  }

  revalidatePath(`/admin/ars/${courseId}/rounds/${roundId}`);
  revalidatePath(`/student/ars/${roundId}`);
  redirect(builderHref(courseId, roundId));
}

export async function addPageAction(formData: FormData): Promise<void> {
  await apply(formData, (spec) => addPage(spec, readText(formData, "title")));
}

export async function renamePageAction(formData: FormData): Promise<void> {
  const stepKey = readKey(formData, "stepKey");
  await apply(formData, (spec) =>
    stepKey
      ? renamePage(spec, stepKey, readText(formData, "title"))
      : { ok: false, message: "That page no longer exists." },
  );
}

export async function setPageSubtitleAction(formData: FormData): Promise<void> {
  const stepKey = readKey(formData, "stepKey");
  await apply(formData, (spec) =>
    stepKey
      ? setPageSubtitle(spec, stepKey, readText(formData, "subtitle", 300))
      : { ok: false, message: "That page no longer exists." },
  );
}

export async function removePageAction(formData: FormData): Promise<void> {
  const stepKey = readKey(formData, "stepKey");
  await apply(formData, (spec) =>
    stepKey ? removePage(spec, stepKey) : { ok: false, message: "That page no longer exists." },
  );
}

export async function addSectionAction(formData: FormData): Promise<void> {
  const stepKey = readKey(formData, "stepKey");
  await apply(formData, (spec) =>
    stepKey
      ? addSection(spec, stepKey, readText(formData, "title"))
      : { ok: false, message: "That page no longer exists." },
  );
}

export async function renameSectionAction(formData: FormData): Promise<void> {
  const stepKey = readKey(formData, "stepKey");
  const sectionIndex = readIndex(formData, "sectionIndex");
  await apply(formData, (spec) =>
    stepKey && sectionIndex !== null
      ? renameSection(spec, stepKey, sectionIndex, readText(formData, "title"))
      : { ok: false, message: "That section no longer exists." },
  );
}

export async function removeSectionAction(formData: FormData): Promise<void> {
  const stepKey = readKey(formData, "stepKey");
  const sectionIndex = readIndex(formData, "sectionIndex");
  await apply(formData, (spec) =>
    stepKey && sectionIndex !== null
      ? removeSection(spec, stepKey, sectionIndex)
      : { ok: false, message: "That section no longer exists." },
  );
}

export async function addFieldAction(formData: FormData): Promise<void> {
  const stepKey = readKey(formData, "stepKey");
  const sectionIndex = readIndex(formData, "sectionIndex");
  const rawWordLimit = readText(formData, "wordLimit", 10);
  const wordLimit = /^[0-9]{1,5}$/.test(rawWordLimit) ? Number.parseInt(rawWordLimit, 10) : null;

  await apply(formData, (spec) =>
    stepKey && sectionIndex !== null
      ? addField(spec, stepKey, sectionIndex, {
          helpText: readText(formData, "helpText", 300),
          label: readText(formData, "label"),
          // One option per line, which is the only place that shape survives --
          // and only because a list of options genuinely is a list of lines.
          options: readText(formData, "options", 2000)
            .split(/\r?\n/)
            .map((entry) => entry.trim())
            .filter(Boolean),
          required: formData.get("required") !== null,
          type: readText(formData, "type", 40),
          wordLimit,
        })
      : { ok: false, message: "That section no longer exists." },
  );
}

export async function removeFieldAction(formData: FormData): Promise<void> {
  const fieldKey = readKey(formData, "fieldKey");
  await apply(formData, (spec) =>
    fieldKey ? removeField(spec, fieldKey) : { ok: false, message: "That question no longer exists." },
  );
}

export async function moveFieldAction(formData: FormData): Promise<void> {
  const fieldKey = readKey(formData, "fieldKey");
  const direction = readText(formData, "direction", 8) === "up" ? "up" : "down";
  await apply(formData, (spec) =>
    fieldKey
      ? moveField(spec, fieldKey, direction)
      : { ok: false, message: "That question no longer exists." },
  );
}
