import { isAppRole, type AppRole } from "@/features/auth/types";

// Pure validation, deliberately free of any database or network call.
//
// Bulk creation (clause 2.1) has to validate every row *before* creating
// anything, because a partial import that leaves half a class created is worse
// than a clean failure. That is only honest if bulk and single creation apply
// the same rules, so the rules live here and both call them.

export interface NewUserInput {
  email: string;
  name: string;
  password: string;
  role: AppRole;
}

export type NewUserFieldErrors = Partial<Record<keyof NewUserInput, string>>;

export interface NewUserValidation {
  errors: NewUserFieldErrors;
  value: NewUserInput | null;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

// Mirrors the policy pushed to Supabase in `config.toml`: at least 8 characters
// with a lowercase letter, an uppercase letter and a digit. Checked here as
// well as there so the admin gets a specific message naming the missing part,
// instead of GoTrue's generic rejection after the round trip.
export const passwordMinLength = 8;

export function describePasswordProblem(password: string): string | null {
  if (password.length < passwordMinLength) {
    return `Use at least ${passwordMinLength} characters.`;
  }
  if (!/[a-z]/.test(password)) return "Include a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Include a digit.";
  return null;
}

// `profiles_email_normalized` in the foundation migration requires a lowercase,
// trimmed address with an `@` that is not the first character. This is a little
// stricter -- it also wants a dot in the domain -- because every address here is
// a real mailbox someone has to receive a password reset at, and the commonest
// bulk-import defect is a truncated domain rather than an exotic valid address.
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateNewUser(raw: {
  email: unknown;
  name: unknown;
  password: unknown;
  role: unknown;
}): NewUserValidation {
  const errors: NewUserFieldErrors = {};

  const name = typeof raw.name === "string" ? normalizeName(raw.name) : "";
  if (!name) errors.name = "Enter a name.";
  else if (name.length > 120) errors.name = "Use 120 characters or fewer.";

  const email = typeof raw.email === "string" ? normalizeEmail(raw.email) : "";
  if (!email) errors.email = "Enter an email address.";
  else if (!emailPattern.test(email)) {
    errors.email = "Enter a valid email address.";
  } else if (email.length > 254) {
    errors.email = "That email address is too long.";
  }

  const password = typeof raw.password === "string" ? raw.password : "";
  if (!password) errors.password = "Set an initial password.";
  else {
    const problem = describePasswordProblem(password);
    if (problem) errors.password = problem;
  }

  const role = raw.role;
  if (!isAppRole(role)) errors.role = "Choose a role.";

  if (Object.keys(errors).length > 0 || !isAppRole(role)) {
    return { errors, value: null };
  }

  return { errors, value: { email, name, password, role } };
}
