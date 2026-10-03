import "server-only";

import { createHash } from "node:crypto";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import {
  canonicalOptions,
  choiceKey,
  judgePaper,
  numericalKey,
  similarityThreshold,
  type BankSet,
  type Comparable,
  type PaperEntry,
  type TextMatch,
  type Verdict,
} from "../duplicates";
import type { StagedQuestion } from "../import-spec";
import { questionImagesBucket } from "../storage";

type Client = Awaited<ReturnType<typeof createServerSupabaseClient>>;

// The database half of duplicate detection: which texts match
// (`find_question_matches`), and what the matched bank questions hold. The
// decision itself is `judgePaper`, which is pure.
//
// Everything is read through the admin's own session, so RLS limits the bank to
// their organisation and the pictures to ones they may open.
//
// Pictures are compared by content, and only where it can matter: for a
// question whose text already equals another's. A Word upload stores every
// picture under a fresh name, so two copies of one chart have different paths
// and the same bytes.

interface BankRow {
  id: number;
  images: unknown;
  options: unknown;
  parent_id: number | null;
  type: string;
}

function imagePaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (entry && typeof entry === "object" && typeof (entry as { path?: unknown }).path === "string") return [(entry as { path: string }).path];
    return [];
  });
}

async function hashImages(supabase: Client, paths: string[]): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  await Promise.all(
    [...new Set(paths)].map(async (path) => {
      const { data } = await supabase.storage.from(questionImagesBucket).download(path);
      // A picture that cannot be read is compared by its path, which matches
      // nothing else: an unreadable figure never makes two questions "the same".
      hashes.set(path, data ? createHash("sha256").update(Buffer.from(await data.arrayBuffer())).digest("hex") : `unreadable:${path}`);
    }),
  );
  return hashes;
}

function bankKey(type: string, options: Array<{ id: string }>, answer: unknown): { key: string[]; tolerance: string } {
  const record = (answer ?? {}) as { accepted?: unknown; options?: unknown; tolerance?: unknown };
  if (type === "mcq" || type === "mcq_multi") {
    const ids = Array.isArray(record.options) ? record.options.map(String) : [];
    return { key: choiceKey(ids.map((id) => options.findIndex((option) => option.id === id)).filter((index) => index >= 0)), tolerance: "" };
  }
  if (type === "numerical") {
    const accepted = Array.isArray(record.accepted) ? record.accepted.map(String) : [];
    return { key: numericalKey(accepted), tolerance: record.tolerance === undefined || record.tolerance === null ? "" : String(record.tolerance) };
  }
  return { key: [], tolerance: "" };
}

function stagedComparable(staged: StagedQuestion, images: string[]): Comparable {
  return {
    images,
    key: staged.type === "numerical" ? numericalKey(staged.accepted) : staged.type === "di_stimulus" ? [] : choiceKey(staged.correctOptions),
    options: staged.type === "mcq" || staged.type === "mcq_multi" ? canonicalOptions(staged.options) : [],
    tolerance: staged.type === "numerical" ? staged.tolerance.trim() : "",
    type: staged.type,
  };
}

// Verdicts for one paper's staged questions, keyed by staged position. A row
// that could not be read as a question gets none.
export async function findDuplicates(
  items: Array<{ parsed: StagedQuestion | null; position: number }>,
): Promise<Map<number, Verdict>> {
  const readable = items.filter((item): item is { parsed: StagedQuestion; position: number } => item.parsed !== null);
  if (readable.length === 0) return new Map();

  const supabase = await createServerSupabaseClient();
  const { data: rawMatches, error } = await supabase.rpc("find_question_matches", {
    p_bodies: readable.map((item) => item.parsed.body),
    p_threshold: similarityThreshold,
  });
  if (error) throw new Error(`Unable to compare with the question bank: ${error.message}`);
  type MatchRow = { input_index: number; match_kind: string; match_ref: number; same_text: boolean; similarity: number };
  const matches: TextMatch[] = ((rawMatches ?? []) as MatchRow[]).map((row) => ({
    inputIndex: row.input_index,
    kind: row.match_kind === "paper" ? "paper" : "bank",
    ref: Number(row.match_ref),
    sameText: row.same_text,
    similarity: Number(row.similarity),
  }));

  // Bank questions whose text equals one of ours: those are the only ones that
  // can be "the same", so only their options, keys, pictures and, for a set,
  // sub-questions are read.
  const exactIds = [...new Set(matches.filter((match) => match.kind === "bank" && match.sameText).map((match) => match.ref))];
  const bankRows: BankRow[] = [];
  if (exactIds.length > 0) {
    const { data, error: bankError } = await supabase.from("questions").select("id, type, options, images, parent_id").in("id", exactIds);
    if (bankError) throw new Error(`Unable to read matching questions: ${bankError.message}`);
    bankRows.push(...((data ?? []) as BankRow[]));
    const setIds = bankRows.filter((row) => row.type === "di_stimulus").map((row) => row.id);
    if (setIds.length > 0) {
      const { data: children, error: childError } = await supabase
        .from("questions")
        .select("id, type, options, images, parent_id")
        .in("parent_id", setIds)
        .order("id");
      if (childError) throw new Error(`Unable to read matching sets: ${childError.message}`);
      for (const child of (children ?? []) as BankRow[]) if (!bankRows.some((row) => row.id === child.id)) bankRows.push(child);
    }
  }

  const keyById = new Map<number, unknown>();
  if (bankRows.length > 0) {
    const { data: keys, error: keyError } = await supabase
      .from("question_keys")
      .select("question_id, correct_answer")
      .in("question_id", bankRows.map((row) => row.id));
    if (keyError) throw new Error(`Unable to read matching answer keys: ${keyError.message}`);
    for (const key of keys ?? []) keyById.set(Number(key.question_id), key.correct_answer);
  }

  // Pictures to hash: ours where our text equals something, and theirs.
  const sameTextInputs = new Set(matches.filter((match) => match.sameText).flatMap((match) => (match.kind === "paper" ? [match.inputIndex, match.ref] : [match.inputIndex])));
  const hashes = await hashImages(supabase, [
    ...readable.flatMap((item, index) => (sameTextInputs.has(index) ? item.parsed.images ?? [] : [])),
    ...bankRows.flatMap((row) => imagePaths(row.images)),
  ]);
  const hashed = (paths: string[]) => paths.map((path) => hashes.get(path) ?? `unhashed:${path}`);

  const bank = new Map<number, Comparable>();
  for (const row of bankRows) {
    const options = Array.isArray(row.options) ? (row.options as Array<{ id: string; text: string }>) : [];
    const { key, tolerance } = bankKey(row.type, options, keyById.get(row.id));
    bank.set(row.id, {
      images: hashed(imagePaths(row.images)),
      key,
      options: canonicalOptions(options.map((option) => option.text)),
      tolerance,
      type: row.type,
    });
  }
  const bankSets = new Map<number, BankSet>();
  for (const row of bankRows.filter((entry) => entry.type === "di_stimulus")) {
    bankSets.set(row.id, {
      children: bankRows
        .filter((child) => child.parent_id === row.id)
        .sort((a, b) => a.id - b.id)
        .map((child) => ({ comparable: bank.get(child.id)!, id: child.id })),
    });
  }

  const entries: PaperEntry[] = readable.map((item) => ({
    comparable: stagedComparable(item.parsed, hashed(item.parsed.images ?? [])),
    parentPosition: item.parsed.parentPosition,
    position: item.position,
  }));
  return judgePaper(entries, { bank, bankSets, matches });
}
