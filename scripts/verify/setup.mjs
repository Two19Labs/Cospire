// Creates throwaway accounts and captures real session cookies.
// Run with: node --env-file=.env.local <path>/setup.mjs
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { writeFileSync } from "node:fs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const OUT = process.argv[2];

if (!URL || !PUB || !SECRET) throw new Error("missing supabase env");

const admin = createClient(URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = Date.now();
const PASSWORD = `DocsVerify${stamp}x`;

const COSPIRE_ORG = 1;
const RIVAL_ORG = 5;

const people = [
  { key: "admin", role: "admin", org: COSPIRE_ORG, name: "Docs Verify Admin" },
  { key: "studentA", role: "student", org: COSPIRE_ORG, name: "Docs Verify Student A" },
  { key: "studentB", role: "student", org: COSPIRE_ORG, name: "Docs Verify Student B" },
  { key: "mentor", role: "mentor", org: COSPIRE_ORG, name: "Docs Verify Mentor" },
  { key: "rivalAdmin", role: "admin", org: RIVAL_ORG, name: "Docs Verify Rival Admin" },
];

async function signIn(email) {
  const jar = [];
  const client = createServerClient(URL, PUB, {
    cookies: {
      getAll: () => [],
      setAll: (list) => {
        for (const cookie of list) jar.push(cookie);
      },
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return {
    cookie: jar.map((c) => `${c.name}=${c.value}`).join("; "),
    accessToken: data.session.access_token,
  };
}

const state = { password: PASSWORD, stamp, people: {} };

for (const person of people) {
  const email = `docs-verify-${person.key.toLowerCase()}-${stamp}@example.com`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createError) throw new Error(`create ${email}: ${createError.message}`);

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    org_id: person.org,
    role: person.role,
    name: person.name,
    email,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error(`profile ${email}: ${profileError.message}`);
  }

  const session = await signIn(email);
  state.people[person.key] = {
    email,
    id: created.user.id,
    org: person.org,
    role: person.role,
    ...session,
  };
  console.log(`created ${person.key.padEnd(11)} ${person.role.padEnd(8)} org ${person.org}`);
}

writeFileSync(OUT, JSON.stringify(state, null, 2));
console.log(`\nstate written to ${OUT}`);
