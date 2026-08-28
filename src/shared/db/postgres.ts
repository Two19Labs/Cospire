import "server-only";

import postgres, { type Sql } from "postgres";

declare global {
  var cospireDatabase: Sql | undefined;
}

export function getDatabase(): Sql {
  if (globalThis.cospireDatabase) return globalThis.cospireDatabase;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const database = postgres(connectionString, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 5,
    prepare: false,
    ssl: "require",
  });

  if (process.env.NODE_ENV !== "production") {
    globalThis.cospireDatabase = database;
  }

  return database;
}
