import { describe, expect, it } from "vitest";

import { buildRoundOptions } from "./round-options";

const titles = new Map([
  [1, "Ashoka ARS"],
  [2, "MU ARS"],
]);
const rounds = [
  { course_id: 1, id: 10, name: "Written application" },
  { course_id: 1, id: 11, name: "Personal interview" },
  { course_id: 2, id: 20, name: "Written application" },
];

describe("buildRoundOptions", () => {
  it("offers only the template programme's rounds, in the given order", () => {
    expect(buildRoundOptions(rounds, titles, 1, [])).toEqual([
      { id: 10, name: "Written application" },
      { id: 11, name: "Personal interview" },
    ]);
  });

  it("keeps a round linked from another process, labelled, so a save cannot silently unlink it", () => {
    expect(buildRoundOptions(rounds, titles, 1, [20])).toEqual([
      { id: 10, name: "Written application" },
      { id: 11, name: "Personal interview" },
      { id: 20, name: "Written application (from MU ARS, another process)" },
    ]);
  });

  it("labels every round with its process when the template has no programme", () => {
    expect(buildRoundOptions(rounds, titles, null, [])).toEqual([
      { id: 11, name: "Ashoka ARS · Personal interview" },
      { id: 10, name: "Ashoka ARS · Written application" },
      { id: 20, name: "MU ARS · Written application" },
    ]);
  });
});
