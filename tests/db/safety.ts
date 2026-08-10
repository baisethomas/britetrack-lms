/**
 * Guard against running the destructive test harness against a real database.
 *
 * `buildSchema()` drops the `public` and `auth` schemas with CASCADE, so a
 * `DATABASE_URL` pointing at a development or production project would lose
 * every table, policy, and row. The harness therefore refuses to run unless
 * the target looks disposable.
 */

export const DESTRUCTIVE_OVERRIDE_ENV = "BRITETRACK_ALLOW_DESTRUCTIVE_DB";

/**
 * Database names we accept without an explicit override: "test" must appear
 * as its own word, so britetrack_test and lms-test-db qualify while attest,
 * protest, latest, and contest do not.
 */
const DISPOSABLE_NAME = /(^|[^a-z])test([^a-z]|$)/i;

export interface SafetyOptions {
  /** Value of the override environment variable, if set. */
  override?: string;
}

/** The database name from a Postgres connection string, or "" if unparseable. */
export function databaseNameFrom(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

function isEnabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

/**
 * Throw unless `connectionString` targets a database safe to wipe.
 *
 * A name containing "test" (britetrack_test, test, lms-test-db) is accepted.
 * Anything else — notably Supabase's default `postgres` database — requires
 * setting BRITETRACK_ALLOW_DESTRUCTIVE_DB=1 as a deliberate opt-in.
 */
export function assertDisposableDatabase(
  connectionString: string,
  options: SafetyOptions = {},
): void {
  if (isEnabled(options.override)) return;

  const name = databaseNameFrom(connectionString);
  if (name && DISPOSABLE_NAME.test(name)) return;

  throw new Error(
    [
      `Refusing to rebuild the schema in database ${name ? `"${name}"` : "(unparseable DATABASE_URL)"}.`,
      "",
      "The database test harness DROPs the public and auth schemas with CASCADE.",
      'To avoid destroying a real project, it only runs against a database whose name contains "test"',
      "(for example britetrack_test — see `npm run db:test:up`).",
      "",
      `If this really is a disposable database, set ${DESTRUCTIVE_OVERRIDE_ENV}=1.`,
    ].join("\n"),
  );
}
