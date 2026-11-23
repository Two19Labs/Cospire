import { beforeEach, describe, expect, it, vi } from "vitest";

// Bulk student creation with the End-to-End enrolment (D62), against stand-in
// clients: every student gets every chosen course in one statement, a course
// of the wrong kind stops the upload before any invitation, and a refused grant
// undoes the accounts like any other failure. The real write is probed in
// `scripts/verify/bundle.sql`.

const state = vi.hoisted(() => ({
  courses: [] as { id: number; kind: string }[],
  deleted: [] as string[],
  grantError: null as { message: string } | null,
  grants: [] as unknown[],
  invited: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/guards", () => ({
  requireRole: async () => ({ id: "admin-1", orgId: 1 }),
}));
vi.mock("@/shared/db/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          state.deleted.push(id);
          return { error: null };
        },
        inviteUserByEmail: async (email: string) => {
          state.invited += 1;
          return { data: { user: { id: `id-${email}` } }, error: null };
        },
        listUsers: async () => ({ data: { users: [] }, error: null }),
      },
    },
  }),
}));
vi.mock("@/shared/db/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: (table: string) => {
      if (table === "courses") {
        return { select: () => ({ in: async () => ({ data: state.courses, error: null }) }) };
      }
      if (table === "profiles") return { insert: async () => ({ error: null }) };
      return {
        insert: async (rows: unknown[]) => {
          state.grants.push(rows);
          return { error: state.grantError };
        },
      };
    },
  }),
}));

const { bulkCreateStudentsAction } = await import("./actions/bulk-create-students");
const { initialBulkCreateStudentsState } = await import("./actions/bulk-create-students-state");

function upload(fields: Record<string, string>) {
  const form = new FormData();
  form.set("sheet", new File(["name,email\nPriya,p@x.in\nSam,s@x.in\n"], "class.csv"));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return bulkCreateStudentsAction(initialBulkCreateStudentsState, form);
}

beforeEach(() => {
  state.courses = [
    { id: 10, kind: "programme" },
    { id: 20, kind: "ars_process" },
  ];
  state.deleted = [];
  state.grantError = null;
  state.grants = [];
  state.invited = 0;
});

describe("bulkCreateStudentsAction with an End-to-End enrolment", () => {
  it("grants every student both courses in one statement", async () => {
    expect((await upload({ processId: "20", programmeId: "10" })).created).toBe(2);
    expect(state.grants).toHaveLength(1);
    const grant = (student: string, course: number) => ({
      granted_by: "admin-1",
      org_id: 1,
      resource_id: course,
      resource_type: "course",
      student_id: `id-${student}`,
    });
    expect(state.grants[0]).toEqual([
      grant("p@x.in", 10),
      grant("p@x.in", 20),
      grant("s@x.in", 10),
      grant("s@x.in", 20),
    ]);
  });

  it("writes no grant when no course is chosen", async () => {
    expect((await upload({ processId: "", programmeId: "" })).created).toBe(2);
    expect(state.grants).toHaveLength(0);
  });

  it("refuses a course of the wrong kind before inviting anyone", async () => {
    const result = await upload({ processId: "10" });
    expect(result.created).toBe(0);
    expect(result.error).toMatch(/not found/);
    expect(state.invited).toBe(0);
  });

  it("undoes every account when the grants are refused", async () => {
    state.grantError = { message: "refused" };
    const result = await upload({ processId: "20", programmeId: "10" });
    expect(result.created).toBe(0);
    expect(result.error).toMatch(/could not be granted/);
    expect(state.deleted).toEqual(["id-p@x.in", "id-s@x.in"]);
  });
});
