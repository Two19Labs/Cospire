import { describe, expect, it } from "vitest";

import { parseMockIdField, readImportBatchId, readRoundMockId, withImportBatch, withRoundMock } from "./round-mock";

describe("readRoundMockId", () => {
  it("reads a positive integer id", () => {
    expect(readRoundMockId({ mockId: 42, prompt: "x" })).toBe(42);
  });

  it.each([
    ["missing", {}],
    ["a string", { mockId: "42" }],
    ["zero", { mockId: 0 }],
    ["negative", { mockId: -3 }],
    ["a fraction", { mockId: 1.5 }],
    ["past the safe range", { mockId: 2 ** 60 }],
    ["null", { mockId: null }],
  ])("treats %s as no mock", (_label, config) => {
    expect(readRoundMockId(config)).toBeNull();
  });

  it("treats a config that is not an object as no mock", () => {
    expect(readRoundMockId(null)).toBeNull();
    expect(readRoundMockId([{ mockId: 3 }])).toBeNull();
    expect(readRoundMockId("mockId")).toBeNull();
  });
});

describe("parseMockIdField", () => {
  it("reads an empty choice as unlinking", () => {
    expect(parseMockIdField("")).toEqual({ mockId: null, ok: true });
  });

  it("reads a decimal id", () => {
    expect(parseMockIdField("17")).toEqual({ mockId: 17, ok: true });
  });

  it.each([["0"], ["-1"], ["1.5"], ["017"], ["abc"], ["1e3"], [" 4"], ["99999999999999999"]])(
    "refuses %s",
    (raw) => {
      expect(parseMockIdField(raw).ok).toBe(false);
    },
  );

  it("refuses anything that is not a string", () => {
    expect(parseMockIdField(null).ok).toBe(false);
    expect(parseMockIdField(5).ok).toBe(false);
  });
});

describe("withRoundMock", () => {
  const imported = { pendingFeature: "test-engine", prompt: "A timed test.", test: { questions: 45 } };

  it("links a mock, clears the placeholder and keeps everything else", () => {
    expect(withRoundMock(imported, 9)).toEqual({ mockId: 9, prompt: "A timed test.", test: { questions: 45 } });
  });

  it("unlinks and restores the placeholder when a test specification is kept", () => {
    expect(withRoundMock({ ...imported, mockId: 9, pendingFeature: undefined }, null)).toMatchObject({
      pendingFeature: "test-engine",
      prompt: "A timed test.",
    });
    expect(withRoundMock({ mockId: 9, test: {} }, null)).not.toHaveProperty("mockId");
  });

  it("unlinks a hand-made round without inventing a placeholder", () => {
    expect(withRoundMock({ mockId: 3, prompt: "Interview" }, null)).toEqual({ prompt: "Interview" });
  });

  it("does not modify the config it was given", () => {
    const config = { ...imported };
    withRoundMock(config, 4);
    expect(config).toEqual(imported);
  });
});

describe("the import mark (D8)", () => {
  const batch = "0f8fad5b-d9cb-469f-a165-70867728950e";

  it("marks a round with the batch and keeps every other key", () => {
    const marked = withImportBatch({ pendingFeature: "test-engine", prompt: "p" }, batch);
    expect(marked).toEqual({ importBatchId: batch, pendingFeature: "test-engine", prompt: "p" });
    expect(readImportBatchId(marked)).toBe(batch);
  });

  it("reads anything that is not a batch id as no mark", () => {
    expect(readImportBatchId({})).toBeNull();
    expect(readImportBatchId({ importBatchId: "x" })).toBeNull();
    expect(readImportBatchId({ importBatchId: 5 })).toBeNull();
  });

  it("linking or unlinking a mock clears the mark", () => {
    expect(withRoundMock(withImportBatch({}, batch), 9)).toEqual({ mockId: 9 });
    expect(readImportBatchId(withRoundMock(withImportBatch({ test: {} }, batch), null))).toBeNull();
  });
});
