import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client, Pool, type PoolClient } from "pg";
import { assertDisposableDatabase, DESTRUCTIVE_OVERRIDE_ENV } from "./safety";

const ROOT = path.resolve(import.meta.dirname, "../..");

export const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54329/britetrack_test";

/**
 * SQL applied to build the test database: the Supabase shim, then every
 * migration in order, then the grants a real project applies to API roles.
 */
const SHIM_PRE = "tests/db/shim/01-supabase-pre.sql";
const SHIM_POST = "tests/db/shim/02-supabase-post.sql";
const MIGRATIONS_DIR = "supabase/migrations";

let pool: Pool | undefined;

/**
 * Drop and rebuild the test schema. Runs once per test run via globalSetup,
 * so no run inherits stale objects from a previous one.
 */
export async function buildSchema(): Promise<void> {
  // Never let a stray DATABASE_URL turn this into a production wipe.
  assertDisposableDatabase(DATABASE_URL, {
    override: process.env[DESTRUCTIVE_OVERRIDE_ENV],
  });

  const admin = new Client({ connectionString: DATABASE_URL });
  await admin.connect();
  try {
    await admin.query("drop schema if exists public cascade");
    await admin.query("drop schema if exists auth cascade");
    await admin.query("create schema public");

    const migrations = (await readdir(path.join(ROOT, MIGRATIONS_DIR)))
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => `${MIGRATIONS_DIR}/${name}`);

    for (const file of [SHIM_PRE, ...migrations, SHIM_POST]) {
      const sql = await readFile(path.join(ROOT, file), "utf8");
      await admin.query(sql);
    }
  } finally {
    await admin.end();
  }
}

/** Open the connection pool for a test file. */
export function connect(): void {
  pool ??= new Pool({ connectionString: DATABASE_URL, max: 4 });
}

/** Close the connection pool for a test file. */
export async function disconnect(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/**
 * Run `fn` inside a transaction that is always rolled back, so tests never
 * see each other's rows and can run in any order.
 */
export async function withRollback<T>(
  fn: (db: TestDb) => Promise<T>,
): Promise<T> {
  if (!pool) throw new Error("connect() has not run");
  const client = await pool.connect();
  try {
    await client.query("begin");
    return await fn(new TestDb(client));
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

/** Result of an operation that RLS may reject. */
export interface Attempt<T> {
  ok: boolean;
  rows: T[];
  error?: string;
}

/**
 * A transaction-scoped handle. Queries run as the privileged owner by
 * default; `asUser`/`asAnon` switch to the unprivileged API roles so RLS
 * applies, exactly as it would for a request from the browser.
 */
export class TestDb {
  constructor(private readonly client: PoolClient) {}

  /** Run SQL as the schema owner — used for seeding, never for assertions. */
  async seed<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { rows } = await this.client.query(sql, params);
    return rows as T[];
  }

  /**
   * Create an auth user (which fires the profile trigger) and return its id.
   * `role` goes into signup metadata, i.e. it is client-controlled — the
   * trigger decides what the profile actually gets.
   */
  async createUser(options: {
    email: string;
    role?: string;
    fullName?: string;
  }): Promise<string> {
    const metadata: Record<string, string> = {};
    if (options.role !== undefined) metadata.role = options.role;
    if (options.fullName !== undefined) metadata.full_name = options.fullName;
    const [row] = await this.seed<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [options.email, JSON.stringify(metadata)],
    );
    return row.id;
  }

  /** Promote a profile directly, bypassing RLS — the admin bootstrap path. */
  async setRole(userId: string, role: string): Promise<void> {
    await this.seed("update public.profiles set role = $2 where id = $1", [
      userId,
      role,
    ]);
  }

  /** Run `fn` as the signed-in user `userId` with RLS enforced. */
  async asUser<T>(userId: string, fn: (q: Query) => Promise<T>): Promise<T> {
    return this.withRole("authenticated", { sub: userId }, fn);
  }

  /** Run `fn` as an unauthenticated caller with RLS enforced. */
  async asAnon<T>(fn: (q: Query) => Promise<T>): Promise<T> {
    return this.withRole("anon", {}, fn);
  }

  private async withRole<T>(
    role: "authenticated" | "anon",
    claims: Record<string, string>,
    fn: (q: Query) => Promise<T>,
  ): Promise<T> {
    // Claims must stay valid JSON: auth.uid() casts the GUC to jsonb, so an
    // anonymous caller gets "{}" rather than an empty string.
    await this.client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claims),
    ]);
    // Role names cannot be bound as parameters; the union type is the guard.
    await this.client.query(`set local role ${role}`);
    try {
      return await fn(new Query(this.client));
    } finally {
      await this.client.query("reset role").catch(() => {});
    }
  }
}

/** Query interface available inside `asUser` / `asAnon`. */
export class Query {
  constructor(private readonly client: PoolClient) {}

  /** Run SQL, throwing if the database rejects it. */
  async run<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { rows } = await this.client.query(sql, params);
    return rows as T[];
  }

  /**
   * Run SQL and report whether it succeeded instead of throwing, so tests can
   * assert that a policy blocked a write. Wrapped in a savepoint because a
   * failed statement aborts the surrounding transaction.
   */
  async attempt<T = unknown>(
    sql: string,
    params: unknown[] = [],
  ): Promise<Attempt<T>> {
    await this.client.query("savepoint attempt");
    try {
      const { rows } = await this.client.query(sql, params);
      await this.client.query("release savepoint attempt");
      return { ok: true, rows: rows as T[] };
    } catch (error) {
      await this.client.query("rollback to savepoint attempt");
      return {
        ok: false,
        rows: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
