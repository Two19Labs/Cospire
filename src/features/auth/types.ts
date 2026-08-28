export const appRoles = ["admin", "mentor", "student"] as const;

export type AppRole = (typeof appRoles)[number];

export interface Profile {
  email: string;
  id: string;
  name: string;
  orgId: number;
  role: AppRole;
}

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && appRoles.includes(value as AppRole);
}

export function roleHomePath(role: AppRole): `/${AppRole}` {
  return `/${role}`;
}
