import { vi } from "vitest";

export interface QueryResult {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}

/** One recorded call on a query builder: the method name and its arguments. */
export type RecordedCall = [method: string, ...args: unknown[]];

/**
 * A stand-in for a PostgREST query builder: every method chains and records
 * itself, and awaiting the chain resolves to `result`. Enough to assert what
 * an action sends without a database.
 */
export function queryChain(result: QueryResult = { data: null, error: null }) {
  const calls: RecordedCall[] = [];
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: QueryResult) => void, reject: (e: unknown) => void) =>
            Promise.resolve(result).then(resolve, reject);
        }
        if (prop === "calls") return calls;
        return (...args: unknown[]) => {
          calls.push([String(prop), ...args]);
          return chain;
        };
      },
    },
  );
  return chain as Record<string, (...args: unknown[]) => typeof chain> & { calls: RecordedCall[] };
}

/**
 * A fake Supabase client. `tables` maps a table name to the result its
 * query chain resolves to; `rpc` resolves every RPC to `rpcResult`.
 */
export function fakeSupabase(options: {
  tables?: Record<string, QueryResult>;
  rpcResult?: QueryResult;
  auth?: Record<string, unknown>;
} = {}) {
  const chains = new Map<string, ReturnType<typeof queryChain>>();
  const from = vi.fn((table: string) => {
    const chain = queryChain(options.tables?.[table] ?? { data: null, error: null });
    chains.set(table, chain);
    return chain;
  });
  const rpc = vi.fn(async () => options.rpcResult ?? { data: null, error: null });
  return {
    from,
    rpc,
    auth: options.auth ?? {},
    /** The recorded calls for a table, in order. */
    callsTo(table: string): RecordedCall[] {
      return chains.get(table)?.calls ?? [];
    },
  };
}

/** Build a FormData from a plain object; array values repeat the key. */
export function formData(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
}
