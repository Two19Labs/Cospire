export interface RoundRow {
  course_id: number;
  id: number;
  name: string;
}

export interface RoundOption {
  id: number;
  name: string;
}

// The rounds a template component may be linked to.
//
// Imported processes reuse the same round names ("Written application",
// "Personal Interview and Group Discussion"), so a bare list of every round in
// the organisation let an admin link a component to another process's round
// without being able to tell. With a programme set, only its rounds are offered.
// A round already linked from elsewhere stays in the list, labelled, because a
// select without it would render as "No round" and the next save would silently
// unlink it. With no programme, every round carries its process name.
export function buildRoundOptions(
  rounds: RoundRow[],
  processTitles: Map<number, string>,
  templateCourseId: number | null,
  linkedRoundIds: number[],
): RoundOption[] {
  const processOf = (round: RoundRow) => processTitles.get(round.course_id) ?? "Unknown process";

  if (templateCourseId === null) {
    return rounds
      .map((round) => ({ id: round.id, name: `${processOf(round)} · ${round.name}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const linked = new Set(linkedRoundIds);
  const own = rounds.filter((round) => round.course_id === templateCourseId);
  const strays = rounds.filter((round) => round.course_id !== templateCourseId && linked.has(round.id));
  return [
    ...own.map((round) => ({ id: round.id, name: round.name })),
    ...strays.map((round) => ({ id: round.id, name: `${round.name} (from ${processOf(round)}, another process)` })),
  ];
}
