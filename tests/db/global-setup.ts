import { buildSchema } from "./harness";

/**
 * Applies the shim + migration once for the whole `db` project run.
 * Requires a reachable Postgres — see `npm run db:test:up`.
 */
export default async function setup() {
  await buildSchema();
}
