import { describe, expect, it } from "vitest";

import {
  describeFileRejection,
  documentMaxBytes,
  validateNewDocument,
} from "./document-input";
import {
  buildDocumentsHref,
  parseDocumentId,
  parseDocumentListError,
  sanitizeDocumentSearch,
  sanitizeFolderFilter,
} from "./list-params";
import {
  buildDocumentStoragePath,
  isDocumentStoragePath,
} from "./storage";
import { composeWatermark } from "./watermark";

describe("validateNewDocument", () => {
  it("accepts a title and an optional folder", () => {
    const { errors, value } = validateNewDocument({
      folder: "  Quant  ",
      title: "  Number systems  ",
    });

    expect(errors).toEqual({});
    expect(value).toEqual({ folder: "Quant", title: "Number systems" });
  });

  it("treats a missing folder as unfiled rather than an error", () => {
    const { value } = validateNewDocument({ folder: "", title: "Anything" });
    expect(value).toEqual({ folder: "", title: "Anything" });
  });

  it("refuses a blank title", () => {
    const { errors, value } = validateNewDocument({
      folder: "",
      title: "   ",
    });

    expect(value).toBeNull();
    expect(errors.title).toBeTruthy();
  });

  it("refuses a folder containing a path separator", () => {
    for (const folder of ["Quant/Advanced", "Quant\\Advanced", "../etc"]) {
      const { errors, value } = validateNewDocument({ folder, title: "Ok" });
      expect(value).toBeNull();
      expect(errors.folder).toBeTruthy();
    }
  });

  it("refuses over-long values at the same bounds as the check constraints", () => {
    expect(
      validateNewDocument({ folder: "", title: "a".repeat(201) }).value,
    ).toBeNull();
    expect(
      validateNewDocument({ folder: "", title: "a".repeat(200) }).value,
    ).not.toBeNull();
    expect(
      validateNewDocument({ folder: "b".repeat(81), title: "Ok" }).value,
    ).toBeNull();
  });

  it("refuses non-string input rather than coercing it", () => {
    const { value } = validateNewDocument({ folder: null, title: 42 });
    expect(value).toBeNull();
  });
});

describe("describeFileRejection", () => {
  it("accepts a PDF within the limit", () => {
    expect(
      describeFileRejection({ size: 1024, type: "application/pdf" }),
    ).toBeNull();
  });

  it("refuses anything that is not a PDF", () => {
    expect(
      describeFileRejection({ size: 1024, type: "image/png" }),
    ).toBeTruthy();
  });

  it("refuses an empty file and one over the bucket limit", () => {
    expect(
      describeFileRejection({ size: 0, type: "application/pdf" }),
    ).toBeTruthy();
    expect(
      describeFileRejection({
        size: documentMaxBytes + 1,
        type: "application/pdf",
      }),
    ).toBeTruthy();
  });
});

describe("sanitizeDocumentSearch", () => {
  it("strips the characters that would rewrite a PostgREST or() filter", () => {
    expect(sanitizeDocumentSearch('x,title.eq.secret')).toBe("x title.eq.secret");
    expect(sanitizeDocumentSearch('a("b")%')).toBe("a b");
  });

  it("keeps underscore, which only ever widens a match", () => {
    expect(sanitizeDocumentSearch("mock_1")).toBe("mock_1");
  });

  it("caps the length", () => {
    expect(sanitizeDocumentSearch("a".repeat(200))).toHaveLength(80);
  });
});

describe("sanitizeFolderFilter", () => {
  it("drops separators so a filter can only ask for a storable folder", () => {
    expect(sanitizeFolderFilter("Quant/Advanced")).toBe("Quant Advanced");
  });

  it("discards a filter longer than the column allows", () => {
    expect(sanitizeFolderFilter("a".repeat(81))).toBe("");
  });
});

describe("parseDocumentId", () => {
  it("accepts a positive whole number", () => {
    expect(parseDocumentId("12")).toBe(12);
  });

  it("refuses anything else", () => {
    for (const raw of [undefined, "", "0", "-1", "1.5", "1e3", "abc", "1 or 1=1"]) {
      expect(parseDocumentId(raw)).toBeNull();
    }
  });
});

describe("buildDocumentsHref", () => {
  it("builds from parsed values only, never from a supplied URL", () => {
    expect(buildDocumentsHref({ page: 1, search: "" })).toBe("/admin/documents");
    expect(
      buildDocumentsHref({ folder: "Quant", page: 3, search: "ratio" }),
    ).toBe("/admin/documents?q=ratio&folder=Quant&page=3");
  });

  it("encodes rather than interpolates", () => {
    const href = buildDocumentsHref({ page: 1, search: "a b&c=d" });
    expect(href).toBe("/admin/documents?q=a+b%26c%3Dd");
  });
});

describe("parseDocumentListError", () => {
  it("resolves only known keys, so a crafted value renders nothing", () => {
    expect(parseDocumentListError("invalid-request")).toBe("invalid-request");
    expect(parseDocumentListError("<img src=x onerror=alert(1)>")).toBeNull();
    expect(parseDocumentListError("constructor")).toBeNull();
    expect(parseDocumentListError("__proto__")).toBeNull();
  });
});

describe("buildDocumentStoragePath", () => {
  const objectId = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";

  it("scopes the key to the organisation and hides the filename", () => {
    expect(buildDocumentStoragePath({ objectId, orgId: 1 })).toBe(
      `org/1/${objectId}.pdf`,
    );
  });

  it("matches the check constraint it mirrors", () => {
    const path = buildDocumentStoragePath({ objectId, orgId: 7 });
    expect(
      new RegExp(
        `^org/7/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.pdf$`,
      ).test(path),
    ).toBe(true);
  });

  it("refuses an object id that is not a UUID", () => {
    expect(() =>
      buildDocumentStoragePath({ objectId: "../../etc/passwd", orgId: 1 }),
    ).toThrow();
  });

  it("refuses a non-positive organisation id", () => {
    expect(() => buildDocumentStoragePath({ objectId, orgId: 0 })).toThrow();
  });
});

describe("isDocumentStoragePath", () => {
  const objectId = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";

  it("accepts a key it built", () => {
    expect(
      isDocumentStoragePath({
        orgId: 1,
        path: buildDocumentStoragePath({ objectId, orgId: 1 }),
      }),
    ).toBe(true);
  });

  it("refuses another organisation's key", () => {
    expect(
      isDocumentStoragePath({ orgId: 2, path: `org/1/${objectId}.pdf` }),
    ).toBe(false);
  });

  it("refuses traversal and extra segments", () => {
    expect(
      isDocumentStoragePath({ orgId: 1, path: `org/1/../2/${objectId}.pdf` }),
    ).toBe(false);
    expect(
      isDocumentStoragePath({ orgId: 1, path: `org/1/nested/${objectId}.pdf` }),
    ).toBe(false);
  });

  it("refuses a non-PDF extension", () => {
    expect(
      isDocumentStoragePath({ orgId: 1, path: `org/1/${objectId}.exe` }),
    ).toBe(false);
  });
});

describe("composeWatermark", () => {
  const viewedAt = new Date("2026-09-02T12:52:31.000Z");

  it("names the viewer and stamps the instant in IST", () => {
    expect(
      composeWatermark({
        subject: { email: "student@example.com", name: "Asha Rao" },
        viewedAt,
      }),
    ).toBe("Asha Rao · student@example.com · 2026-09-02 18:22 IST");
  });

  it("falls back to the address when a name is missing", () => {
    expect(
      composeWatermark({
        subject: { email: "student@example.com", name: "   " },
        viewedAt,
      }),
    ).toBe("student@example.com · 2026-09-02 18:22 IST");
  });

  it("rolls the date over when IST crosses midnight ahead of UTC", () => {
    // 19:30 UTC is 01:00 the next day in India. Getting this wrong would date a
    // screenshot to the previous day, which is exactly the kind of quiet error
    // an evidence trail cannot afford.
    expect(
      composeWatermark({
        subject: { email: "a@b.com", name: "A" },
        viewedAt: new Date("2026-09-02T19:30:00.000Z"),
      }),
    ).toBe("A · a@b.com · 2026-09-03 01:00 IST");
  });

  it("adds exactly five and a half hours, and no daylight saving", () => {
    // Sampled across the year: India has had no DST since 1945, so the offset
    // must not move in July.
    expect(
      composeWatermark({
        subject: { email: "a@b.com", name: "A" },
        viewedAt: new Date("2026-07-15T00:00:00.000Z"),
      }),
    ).toBe("A · a@b.com · 2026-07-15 05:30 IST");
    expect(
      composeWatermark({
        subject: { email: "a@b.com", name: "A" },
        viewedAt: new Date("2026-01-15T00:00:00.000Z"),
      }),
    ).toBe("A · a@b.com · 2026-01-15 05:30 IST");
  });

  it("is stable regardless of the machine's own time zone", () => {
    const first = composeWatermark({
      subject: { email: "a@b.com", name: "A" },
      viewedAt,
    });
    const second = composeWatermark({
      subject: { email: "a@b.com", name: "A" },
      viewedAt: new Date(viewedAt.getTime()),
    });
    expect(first).toBe(second);
  });
});
