import { describe, expect, it } from "vitest";

import {
  buildArsUploadPath,
  describeArsUploadRejection,
  isStoredArsUpload,
} from "./upload";

describe("ARS uploads", () => {
  it("builds the database-constrained private student path", () => {
    expect(
      buildArsUploadPath({
        extension: "pdf",
        objectId: "11111111-1111-4111-8111-111111111111",
        orgId: 7,
        studentId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe(
      "org/7/ars/22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111.pdf",
    );
  });

  it("refuses a type the field did not declare", () => {
    expect(describeArsUploadRejection({ size: 100, type: "image/png" }, ["pdf"]))
      .toBe("Choose one of the allowed file types.");
  });

  it("refuses empty and oversized files before transfer", () => {
    expect(describeArsUploadRejection({ size: 0, type: "application/pdf" }, ["pdf"]))
      .toBe("That file is empty.");
    expect(describeArsUploadRejection({ size: 50 * 1024 * 1024 + 1, type: "application/pdf" }, ["pdf"]))
      .toBe("Choose a file smaller than 50 MB.");
  });

  it("recognises only complete stored metadata", () => {
    expect(isStoredArsUpload({
      mimeType: "application/pdf",
      originalName: "marksheet.pdf",
      size: 42,
      storagePath: "org/1/ars/student/file.pdf",
    })).toBe(true);
    expect(isStoredArsUpload({ originalName: "marksheet.pdf" })).toBe(false);
  });
});
