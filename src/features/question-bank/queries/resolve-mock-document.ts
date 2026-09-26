import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import type { MockDocumentSpec } from "../mock-document";
import type { MockPreview, MockPreviewQuestion } from "../mock-document-state";
import { formatQuestionId } from "../question-id";

// The half of the mock document the parser cannot know: whether each ID names a
// question in this bank, whether it is archived, and whether it is a DI child
// rather than the set itself.
//
// No organisation filter anywhere below. `questions_select_author` scopes the
// rows, so another organisation's ID reads as "not a question in this bank" --
// which is both the right answer and the true one. Writing the scope here as
// well would be application code impersonating the access control.
//
// This resolves; it does not write. The preview an admin reads comes from here,
// and confirming runs the whole thing again rather than trusting what the
// browser sends back.

interface QuestionRow {
  archived_at: string | null;
  body: string;
  id: number;
  marks: number | string;
  parent_id: number | null;
  question_sections: unknown;
  type: MockPreviewQuestion["type"];
}

// PostgREST returns a many-to-one embed as an object, not a one-element array.
// Both shapes are handled for the reason `mock-builder.ts` records: the
// generated types describe the relationship, not the runtime payload.
function embeddedName(value: unknown): string {
  const row = Array.isArray(value) ? value[0] : value;
  const name = (row as { name?: unknown } | null | undefined)?.name;
  return typeof name === "string" && name.length > 0 ? name : "—";
}

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 100 ? `${flat.slice(0, 97)}…` : flat;
}

export interface ResolvedMockDocument {
  preview: MockPreview | null;
  problems: string[];
  // The section payload `save_mock` takes, stimulus first and every
  // sub-question after it, in id order.
  sections: Array<{ durationMinutes: number | null; questions: number[]; title: string }>;
}

export async function resolveMockDocument(spec: MockDocumentSpec): Promise<ResolvedMockDocument> {
  const problems: string[] = [];
  const ids = spec.sections.flatMap((section) => section.refs.map((ref) => ref.id));
  const supabase = await createServerSupabaseClient();

  const byId = new Map<number, QuestionRow>();
  if (ids.length > 0) {
    const { data, error } = await supabase
      .from("questions")
      .select("id,body,type,marks,parent_id,archived_at,question_sections(name)")
      .in("id", ids);
    if (error) throw new Error(`Unable to read the questions this document names: ${error.message}`);
    for (const row of (data ?? []) as QuestionRow[]) byId.set(Number(row.id), row);
  }

  // Sub-questions for every DI set named, in id order, which is the order the
  // builder adds them in and the order a student then sees.
  const stimulusIds = [...byId.values()].filter((row) => row.type === "di_stimulus" && row.archived_at === null).map((row) => Number(row.id));
  const childrenByParent = new Map<number, number[]>();
  if (stimulusIds.length > 0) {
    const { data, error } = await supabase
      .from("questions")
      .select("id,parent_id")
      .in("parent_id", stimulusIds)
      .is("archived_at", null)
      .order("id", { ascending: true });
    if (error) throw new Error(`Unable to read the sub-questions of a DI set: ${error.message}`);
    for (const child of data ?? []) {
      if (child.parent_id === null) continue;
      childrenByParent.set(Number(child.parent_id), [...(childrenByParent.get(Number(child.parent_id)) ?? []), Number(child.id)]);
    }
  }

  const previewSections: MockPreview["sections"] = [];
  const saveSections: ResolvedMockDocument["sections"] = [];
  let questionCount = 0;

  for (const section of spec.sections) {
    const questions: MockPreviewQuestion[] = [];
    const saveIds: number[] = [];
    for (const ref of section.refs) {
      const label = formatQuestionId(ref.id);
      const row = byId.get(ref.id);
      if (!row) {
        problems.push(`Line ${ref.line}: ${label} is not a question in this bank.`);
        continue;
      }
      if (row.archived_at !== null) {
        problems.push(`Line ${ref.line}: ${label} is archived, so it cannot go into a new mock. Restore it, or take it out of the document.`);
        continue;
      }
      if (row.parent_id !== null) {
        problems.push(`Line ${ref.line}: ${label} is one question inside a DI set. Use the set's own ID, ${formatQuestionId(Number(row.parent_id))}, which brings the passage and every sub-question with it.`);
        continue;
      }
      const children = childrenByParent.get(ref.id) ?? [];
      if (row.type === "di_stimulus" && children.length === 0) {
        problems.push(`Line ${ref.line}: ${label} is a DI set with no sub-questions yet, so there is nothing to put in the mock.`);
        continue;
      }
      questions.push({
        childCount: children.length,
        excerpt: excerpt(String(row.body)),
        id: ref.id,
        label,
        marks: String(row.marks),
        sectionName: embeddedName(row.question_sections),
        type: row.type,
      });
      saveIds.push(ref.id, ...children);
      questionCount += 1 + children.length;
    }
    previewSections.push({ durationMinutes: section.durationMinutes, questions, title: section.title });
    saveSections.push({ durationMinutes: section.durationMinutes, questions: saveIds, title: section.title });
  }

  if (problems.length > 0) return { preview: null, problems, sections: [] };

  return {
    preview: {
      allowMobile: spec.allowMobile,
      durationMinutes: spec.durationMinutes,
      maxAttempts: spec.maxAttempts,
      negativeMarking: spec.negativeMarking,
      negativeMarkingTypes: spec.negativeMarkingTypes,
      proctoringEnabled: spec.proctoringEnabled,
      proctoringStated: spec.proctoringStated,
      questionCount,
      sections: previewSections,
      timingMode: spec.timingMode,
      title: spec.title,
    },
    problems: [],
    sections: saveSections,
  };
}
