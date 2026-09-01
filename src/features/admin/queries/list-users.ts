import "server-only";

import { isAppRole, type AppRole } from "@/features/auth/types";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { sanitizeUserSearch, usersPageSize } from "../list-params";

export type UserStatus = "active" | "disabled";

export interface UserListRow {
  email: string;
  id: string;
  name: string;
  role: AppRole;
  status: UserStatus;
}

export interface UserListPage {
  page: number;
  pageCount: number;
  rows: UserListRow[];
  total: number;
}

function isUserStatus(value: unknown): value is UserStatus {
  return value === "active" || value === "disabled";
}

export async function listUsers({
  page,
  search,
}: {
  page: number;
  search: string;
}): Promise<UserListPage> {
  const supabase = await createServerSupabaseClient();
  const term = sanitizeUserSearch(search);
  const from = (page - 1) * usersPageSize;

  // No org filter and no role filter. `profiles_select_authorized` already
  // restricts an admin to their own organisation, and re-stating that here
  // would be application code impersonating the access control -- the exact
  // habit operating manual §2 rules out. If the policy ever changes, this
  // screen should change with it rather than silently mask the difference.
  let query = supabase
    .from("profiles")
    .select("id, name, email, role, status", { count: "exact" })
    .order("name", { ascending: true })
    // A second, unique sort key. Two people sharing a name would otherwise come
    // back in an arbitrary order, and rows could swap between pages so that one
    // is shown twice and another never appears at all.
    .order("id", { ascending: true })
    .range(from, from + usersPageSize - 1);

  if (term) {
    query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
  }

  const { count, data, error } = await query;

  if (error) {
    throw new Error(`Unable to list users: ${error.message}`);
  }

  const rows: UserListRow[] = (data ?? []).map((entry) => {
    const row = entry as Record<string, unknown>;

    if (
      typeof row.id !== "string" ||
      typeof row.name !== "string" ||
      typeof row.email !== "string" ||
      !isAppRole(row.role) ||
      !isUserStatus(row.status)
    ) {
      throw new Error("A profile row came back in an unexpected shape.");
    }

    return {
      email: row.email,
      id: row.id,
      name: row.name,
      role: row.role,
      status: row.status,
    };
  });

  const total = count ?? rows.length;

  return {
    page,
    pageCount: Math.max(1, Math.ceil(total / usersPageSize)),
    rows,
    total,
  };
}
