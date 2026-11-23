import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const session = vi.hoisted(() => ({ role: "student" as "admin" | "student" }));
const db = vi.hoisted(() => ({
  insertError: null as { message: string } | null,
  inserted: [] as Record<string, unknown>[],
  updated: [] as { id: unknown; values: Record<string, unknown> }[],
  updatedRows: [{ id: 1 }] as { id: number }[],
}));

vi.mock("@/features/auth/guards", () => ({
  requireRole: vi.fn(async (role: string) => {
    if (role !== session.role) throw new Error(`NEXT_REDIRECT /${session.role}`);
    return { email: "s@example.com", id: "user-1", name: "S", orgId: 1, role };
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("@/shared/db/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        db.inserted.push(row);
        return { error: db.insertError };
      },
      update: (values: Record<string, unknown>) => ({
        eq: (_column: string, id: unknown) => ({
          select: async () => {
            db.updated.push({ id, values });
            return { data: db.updatedRows, error: null };
          },
        }),
      }),
    }),
  }),
}));

import { fileReportAction, setReportStatusAction } from "./actions";
import { buildInboxHref, initialReportState, normalisePage, parseInboxFilters, parseReport } from "./support";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("normalisePage", () => {
  it("keeps the path and query, and cuts a full address to them", () => {
    expect(normalisePage("/student/attempts/9?q=3")).toBe("/student/attempts/9?q=3");
    expect(normalisePage("https://app.cospire.in/student/mocks?x=1#top")).toBe("/student/mocks?x=1");
  });

  it("reads anything else as unknown, and caps the length", () => {
    expect(normalisePage(undefined)).toBe("unknown");
    expect(normalisePage("   ")).toBe("unknown");
    expect(normalisePage(`/${"a".repeat(600)}`)).toHaveLength(500);
  });
});

describe("parseReport", () => {
  it("trims the comment and accepts both kinds", () => {
    expect(parseReport({ comment: "  Key is wrong  ", kind: "mistake", page: "/student" })).toEqual({
      comment: "Key is wrong", kind: "mistake", page: "/student",
    });
    expect(parseReport({ comment: "Video stalls", kind: "ticket", page: null })).toMatchObject({ kind: "ticket", page: "unknown" });
  });

  it("refuses an unknown kind, a blank comment and one over 2000 characters", () => {
    expect(typeof parseReport({ comment: "x", kind: "praise", page: "/" })).toBe("string");
    expect(typeof parseReport({ comment: "   ", kind: "ticket", page: "/" })).toBe("string");
    expect(typeof parseReport({ comment: "x".repeat(2001), kind: "mistake", page: "/" })).toBe("string");
    expect(typeof parseReport({ comment: "x".repeat(2000), kind: "mistake", page: "/" })).toBe("object");
  });
});

describe("inbox filters", () => {
  it("defaults to open, reads all as any status, and ignores nonsense", () => {
    expect(parseInboxFilters("ticket", {})).toEqual({ kind: "ticket", page: 1, status: "open" });
    expect(parseInboxFilters("mistake", { page: "3", status: "all" })).toEqual({ kind: "mistake", page: 3, status: null });
    expect(parseInboxFilters("ticket", { page: "-2", status: "deleted" })).toEqual({ kind: "ticket", page: 1, status: "open" });
  });

  it("round-trips through the address", () => {
    expect(buildInboxHref({ kind: "mistake", page: 2, status: null }, "resolved")).toBe(
      "/admin/support?view=mistake&status=all&page=2&notice=resolved",
    );
  });
});

describe("fileReportAction", () => {
  beforeEach(() => {
    session.role = "student";
    db.inserted = [];
    db.insertError = null;
  });

  it("files the report as the signed-in student, whatever the form says", async () => {
    const result = await fileReportAction(
      initialReportState,
      form({ comment: " Wrong key ", kind: "mistake", org_id: "5", page: "/student/attempts/4", reporter_id: "someone-else", status: "resolved" }),
    );
    expect(result).toEqual({ error: null, sent: true });
    expect(db.inserted).toEqual([{ comment: "Wrong key", kind: "mistake", org_id: 1, page: "/student/attempts/4", reporter_id: "user-1" }]);
  });

  it("writes nothing for a blank comment", async () => {
    const result = await fileReportAction(initialReportState, form({ comment: " ", kind: "ticket", page: "/student" }));
    expect(result.sent).toBe(false);
    expect(db.inserted).toEqual([]);
  });

  it("says so when the database refuses", async () => {
    db.insertError = { message: "new row violates row-level security policy" };
    expect((await fileReportAction(initialReportState, form({ comment: "x", kind: "ticket", page: "/" }))).sent).toBe(false);
  });

  it("is for students only", async () => {
    session.role = "admin";
    await expect(fileReportAction(initialReportState, form({ comment: "x", kind: "ticket", page: "/" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(db.inserted).toEqual([]);
  });
});

describe("setReportStatusAction", () => {
  beforeEach(() => {
    session.role = "admin";
    db.updated = [];
    db.updatedRows = [{ id: 7 }];
  });

  it("changes only the status, then returns to the same filtered page", async () => {
    await expect(setReportStatusAction(form({ filter: "open", id: "7", page: "2", status: "resolved", view: "mistake" }))).rejects.toThrow(
      "NEXT_REDIRECT /admin/support?view=mistake&status=open&page=2&notice=resolved",
    );
    expect(db.updated).toEqual([{ id: 7, values: { status: "resolved" } }]);
  });

  it("refuses a status it does not know, and reports a row RLS hid", async () => {
    await expect(setReportStatusAction(form({ id: "7", status: "deleted", view: "ticket" }))).rejects.toThrow("notice=failed");
    expect(db.updated).toEqual([]);
    db.updatedRows = [];
    await expect(setReportStatusAction(form({ id: "7", status: "open", view: "ticket" }))).rejects.toThrow("notice=failed");
  });

  it("is for admins only", async () => {
    session.role = "student";
    await expect(setReportStatusAction(form({ id: "7", status: "resolved", view: "ticket" }))).rejects.toThrow("NEXT_REDIRECT /student");
    expect(db.updated).toEqual([]);
  });
});
