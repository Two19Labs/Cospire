// Recognising a question the bank already holds (decisions D22-D24).
//
// No model is involved. The database compares texts
// (`public.find_question_matches`): equal normalised text, or trigram
// similarity above a threshold. This file decides what each match means:
//
//   - **same**: the text is equal AND the type, the options in order, the key
//     and the pictures are equal. Linked to the existing question
//     automatically, with nothing changed.
//   - **repeat**: the same, but against an earlier question in this paper. It
//     takes whatever that one becomes.
//   - **possible**: anything else that matched. A person decides: same
//     question, corrected version, or a different question (D24). **Nothing
//     links on similarity alone** (O3).
//   - **new**: nothing matched.
//
// A DI set is all or nothing (28 Sept D4): it links only when its passage and
// every sub-question, in order, are the same as an existing set's. Anything
// less is a new set, because linking part of it would change what the set holds
// in mocks already sat. A set that only resembles one is new, with a note.
//
// Pure, so every case in the decision table is unit tested without a database.

import { parseNumericalAnswer } from "./numerical";
import { formatQuestionId } from "./question-id";

export const similarityThreshold = 0.5;
const maxCandidates = 3;

// One row of `find_question_matches`.
export interface TextMatch {
  inputIndex: number;
  kind: "bank" | "paper";
  // A question id for "bank"; an earlier input index for "paper".
  ref: number;
  sameText: boolean;
  similarity: number;
}

// Everything besides the text that must be equal for "same".
export interface Comparable {
  images: string[];
  key: string[];
  options: string[];
  tolerance: string;
  type: string;
}

export type Candidate =
  | { questionId: number; sameText: boolean; similarity: number; source: "bank" }
  | { position: number; sameText: boolean; similarity: number; source: "paper" };

export type Verdict =
  | { kind: "new"; note?: string }
  | { kind: "same"; questionId: number }
  | { kind: "repeat"; position: number }
  | { kind: "possible"; candidates: Candidate[] };

// Option texts compared as a reader would: case and spacing ignored, order
// kept. Options in a different order are a different question to a student who
// answers by letter, so they are flagged rather than linked.
export function canonicalOptions(texts: string[]): string[] {
  return texts.map((text) => text.toLowerCase().replace(/\s+/g, " ").trim());
}

// A choice key as the indices of the correct options, sorted.
export function choiceKey(indices: number[]): string[] {
  return [...new Set(indices)].sort((a, b) => a - b).map(String);
}

// A numerical key as the values it accepts, so "0.5" and "1/2" are one key. A
// form the parser cannot read is kept as written rather than dropped.
export function numericalKey(accepted: string[]): string[] {
  const values = accepted.map((form) => {
    const value = parseNumericalAnswer(form);
    return value ? `${value.numerator}/${value.denominator}` : form.trim();
  });
  return [...new Set(values)].sort();
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function sameQuestion(a: Comparable, b: Comparable): boolean {
  return (
    a.type === b.type &&
    sameList(a.options, b.options) &&
    sameList(a.key, b.key) &&
    a.tolerance === b.tolerance &&
    sameList(a.images, b.images)
  );
}

// One question of the paper, as the matcher sees it.
export interface PaperEntry {
  comparable: Comparable;
  // For a DI sub-question, the position of its passage; null otherwise.
  parentPosition: number | null;
  position: number;
}

export interface BankSet {
  // The set's sub-questions in id order, each with what "same" compares.
  children: Array<{ comparable: Comparable; id: number }>;
}

export interface MatchContext {
  bank: Map<number, Comparable>;
  // Keyed by the passage's question id.
  bankSets: Map<number, BankSet>;
  matches: TextMatch[];
}

function candidatesFor(position: number, matches: TextMatch[], positionOfInput: (index: number) => number): Candidate[] {
  return matches
    .filter((match) => match.inputIndex === position)
    .sort((a, b) => Number(b.sameText) - Number(a.sameText) || b.similarity - a.similarity || a.ref - b.ref)
    .slice(0, maxCandidates)
    .map((match) =>
      match.kind === "bank"
        ? { questionId: match.ref, sameText: match.sameText, similarity: match.similarity, source: "bank" as const }
        : { position: positionOfInput(match.ref), sameText: match.sameText, similarity: match.similarity, source: "paper" as const },
    );
}

// Decides every entry. Input indices in `matches` are positions in `entries`.
export function judgePaper(entries: PaperEntry[], context: MatchContext): Map<number, Verdict> {
  const verdicts = new Map<number, Verdict>();
  const positionOf = (index: number) => entries[index]?.position ?? index;
  const byPosition = new Map(entries.map((entry, index) => [entry.position, { entry, index }]));
  const matchesOf = (index: number) => context.matches.filter((match) => match.inputIndex === index);
  const childrenOf = new Map<number, number[]>();
  entries.forEach((entry, index) => {
    if (entry.parentPosition !== null) childrenOf.set(entry.parentPosition, [...(childrenOf.get(entry.parentPosition) ?? []), index]);
  });

  entries.forEach((entry, index) => {
    if (entry.parentPosition !== null) return; // decided with its set

    if (entry.comparable.type === "di_stimulus") {
      const children = childrenOf.get(entry.position) ?? [];
      const linked = matchesOf(index)
        .filter((match) => match.kind === "bank" && match.sameText)
        .map((match) => match.ref)
        .sort((a, b) => a - b)
        .find((setId) => {
          const set = context.bankSets.get(setId);
          const passage = context.bank.get(setId);
          if (!set || !passage || !sameQuestion(entry.comparable, passage) || set.children.length !== children.length) return false;
          return children.every((childIndex, order) => {
            const bankChild = set.children[order];
            const textEqual = matchesOf(childIndex).some((match) => match.kind === "bank" && match.ref === bankChild.id && match.sameText);
            return textEqual && sameQuestion(entries[childIndex].comparable, bankChild.comparable);
          });
        });

      if (linked !== undefined) {
        const set = context.bankSets.get(linked)!;
        verdicts.set(entry.position, { kind: "same", questionId: linked });
        children.forEach((childIndex, order) => verdicts.set(entries[childIndex].position, { kind: "same", questionId: set.children[order].id }));
        return;
      }

      const resembles = matchesOf(index).filter((match) => match.kind === "bank").sort((a, b) => b.similarity - a.similarity)[0];
      const note = resembles
        ? `This passage resembles an existing set, ${formatQuestionId(resembles.ref)}, but not every part matches, so it is imported as a new set.`
        : undefined;
      verdicts.set(entry.position, note ? { kind: "new", note } : { kind: "new" });
      for (const childIndex of children) verdicts.set(entries[childIndex].position, { kind: "new" });
      return;
    }

    const own = matchesOf(index);
    const exactBank = own
      .filter((match) => match.kind === "bank" && match.sameText)
      .map((match) => match.ref)
      .sort((a, b) => a - b)
      .find((id) => {
        const bank = context.bank.get(id);
        return bank !== undefined && sameQuestion(entry.comparable, bank);
      });
    if (exactBank !== undefined) {
      verdicts.set(entry.position, { kind: "same", questionId: exactBank });
      return;
    }

    const exactEarlier = own
      .filter((match) => match.kind === "paper" && match.sameText)
      .map((match) => match.ref)
      .sort((a, b) => a - b)
      .find((earlier) => {
        const other = entries[earlier];
        return other !== undefined && other.parentPosition === null && sameQuestion(entry.comparable, other.comparable);
      });
    if (exactEarlier !== undefined) {
      verdicts.set(entry.position, { kind: "repeat", position: positionOf(exactEarlier) });
      return;
    }

    // A sub-question of an earlier set is not offered: it can only be reached
    // through its own set, so it is not a candidate for a standalone question.
    const candidates = candidatesFor(index, context.matches, positionOf).filter(
      (candidate) => candidate.source === "bank" || byPosition.get(candidate.position)?.entry.parentPosition === null,
    );
    verdicts.set(entry.position, candidates.length > 0 ? { kind: "possible", candidates } : { kind: "new" });
  });

  return verdicts;
}
