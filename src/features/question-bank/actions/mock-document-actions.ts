"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { maxMockDocumentLength, parseMockDocument } from "../mock-document";
import { initialMockDocumentState, type MockDocumentState } from "../mock-document-state";
import { resolveMockDocument } from "../queries/resolve-mock-document";

// Building a mock from a document that quotes question IDs.
//
// Admin-only, matching the policies on `mocks`, `mock_sections` and
// `mock_questions`, and matching `save_mock`, which refuses anyone who is not an
// active admin of the organisation.
//
// **Reading a paste writes nothing.** Confirming re-reads the pasted text on the
// server rather than trusting the preview the browser sends back, because a
// Server Action is a public endpoint and the preview is only a form field. That
// is the same rule the question importer follows, for the same reason.
//
// There is no new write path and no migration: the confirm ends in the existing
// `save_mock`, so every structural rule the builder is already held to -- one
// implicit untimed section or minutes that add up exactly, no archived question,
// a DI set whole in one section -- is enforced by the same trigger.

function readPaste(formData: FormData): string {
  const raw = formData.get("pasted");
  return typeof raw === "string" ? raw.slice(0, maxMockDocumentLength) : "";
}

export async function previewMockDocumentAction(
  _state: MockDocumentState,
  formData: FormData,
): Promise<MockDocumentState> {
  await requireRole("admin");
  const pasted = readPaste(formData);
  if (pasted.trim() === "") return { ...initialMockDocumentState, problems: ["Paste the mock document first."] };

  const { problems, spec } = parseMockDocument(pasted);
  if (spec === null) return { pasted, preview: null, problems };

  const resolved = await resolveMockDocument(spec);
  if (resolved.preview === null) return { pasted, preview: null, problems: resolved.problems };
  return { pasted, preview: resolved.preview, problems: [] };
}

export async function importMockDocumentAction(
  _state: MockDocumentState,
  formData: FormData,
): Promise<MockDocumentState> {
  await requireRole("admin");
  const pasted = readPaste(formData);
  if (pasted.trim() === "") return { ...initialMockDocumentState, problems: ["Paste the mock document first."] };

  const { problems, spec } = parseMockDocument(pasted);
  if (spec === null) return { pasted, preview: null, problems };

  const resolved = await resolveMockDocument(spec);
  if (resolved.preview === null) return { pasted, preview: null, problems: resolved.problems };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("save_mock", {
    p_allow_mobile: spec.allowMobile,
    p_duration_minutes: spec.durationMinutes,
    p_instructions: "",
    p_max_attempts: spec.maxAttempts,
    p_mock_id: null,
    p_negative_marking: spec.negativeMarking,
    p_negative_marking_types: spec.negativeMarkingTypes,
    p_proctoring_enabled: spec.proctoringEnabled,
    p_sections: resolved.sections,
    p_title: spec.title,
  });
  if (error || data === null) {
    // The database's own refusal, shown as itself. It is the authority on mock
    // structure, and paraphrasing it here would hide a rule this parser has got
    // wrong rather than surfacing it.
    return {
      pasted,
      preview: resolved.preview,
      problems: [
        error?.code === "23514"
          ? `The database refused that mock structure: ${error.message}`
          : `The mock could not be saved${error ? `: ${error.message}` : "."}`,
      ],
    };
  }

  revalidatePath("/admin/mocks");
  redirect(`/admin/mocks/${data}?notice=saved`);
}
