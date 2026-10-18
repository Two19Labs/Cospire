// D42, D54. The four things an admin may delete, and the words each count is
// stated in on the confirmation screen.
//
// Pure, so the confirmation sentence is unit-tested: it is the only thing
// standing between a click and rows that cannot come back.

export type DeleteTargetType = "document" | "mock" | "programme" | "video";

export interface DeleteTarget {
  noun: string;
  listHref: string;
  listLabel: string;
  detailHref: (id: number) => string;
}

export const deleteTargets: Record<DeleteTargetType, DeleteTarget> = {
  document: {
    noun: "document",
    listHref: "/admin/documents",
    listLabel: "Documents",
    detailHref: (id) => `/admin/documents/${id}`,
  },
  mock: {
    noun: "mock test",
    listHref: "/admin/mocks",
    listLabel: "Mock tests",
    detailHref: (id) => `/admin/mocks/${id}`,
  },
  programme: {
    noun: "programme",
    listHref: "/admin/courses",
    listLabel: "Programmes",
    detailHref: (id) => `/admin/courses/${id}`,
  },
  video: {
    noun: "video",
    listHref: "/admin/videos",
    listLabel: "Videos",
    detailHref: (id) => `/admin/videos/${id}`,
  },
};

// `Object.hasOwn`, not `in`: `in` is true for `__proto__`, and
// `/admin/delete/__proto__/1` then looked up `Object.prototype` and read
// `noun` off it. Found by the test below rather than by a reviewer.
export function parseDeleteTargetType(raw: unknown): DeleteTargetType | null {
  return typeof raw === "string" && Object.hasOwn(deleteTargets, raw) ? (raw as DeleteTargetType) : null;
}

// One pair of words per count the preview can return. The order here is the
// order on screen: what a student loses first, then what an admin loses.
const countWords: Array<[string, string, string]> = [
  ["attempts", "student attempt and its result", "student attempts and their results"],
  ["responses", "saved answer", "saved answers"],
  ["attemptSections", "section timer", "section timers"],
  ["proctorEvents", "logged proctoring event", "logged proctoring events"],
  ["essayMarks", "essay mark", "essay marks"],
  ["progressRows", "student progress record", "student progress records"],
  ["grants", "student access grant", "student access grants"],
  ["sections", "curriculum section", "curriculum sections"],
  ["curriculumItems", "place in a programme curriculum", "places in a programme curriculum"],
  ["paperSections", "section of the paper", "sections of the paper"],
  ["paperQuestions", "question placed in the paper", "questions placed in the paper"],
  ["storageObjects", "stored file", "stored files"],
  ["vdocipherVideos", "video in VdoCipher", "videos in VdoCipher"],
];

// "this mock test, 14 student attempts and their results, 28 saved answers".
// A zero is left out: naming what will not be removed makes the line longer and
// the real numbers harder to see.
export function describeDeletion(type: DeleteTargetType, counts: Record<string, number>): string[] {
  const parts = [`this ${deleteTargets[type].noun}`];
  for (const [key, one, many] of countWords) {
    const count = counts[key] ?? 0;
    if (count > 0) parts.push(`${count} ${count === 1 ? one : many}`);
  }
  return parts;
}

// Whitespace only, deliberately: `public.delete_content` normalises the typed
// name the same way and nothing else, so a name the form accepts is a name the
// database accepts. Both have to agree or the refusal is unexplainable.
export function collapseName(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
}
