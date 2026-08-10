import { describe, expect, it } from "vitest";
import {
  assertDisposableDatabase,
  assertRebuildableContents,
  databaseNameFrom,
} from "../db/safety";

const supabase = "postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres";
const local = "postgresql://postgres:postgres@127.0.0.1:54329/britetrack_test";

describe("databaseNameFrom", () => {
  it("extracts the database name", () => {
    expect(databaseNameFrom(local)).toBe("britetrack_test");
    expect(databaseNameFrom(supabase)).toBe("postgres");
  });

  it("returns an empty string for an unparseable URL", () => {
    expect(databaseNameFrom("not a url")).toBe("");
  });
});

describe("assertDisposableDatabase", () => {
  it("allows databases whose name marks them as test databases", () => {
    for (const name of [
      "britetrack_test",
      "test",
      "test_db",
      "lms-test-db",
      "britetrack-test",
    ]) {
      expect(() =>
        assertDisposableDatabase(`postgresql://u@localhost:5432/${name}`),
      ).not.toThrow();
    }
  });

  it("refuses a real Supabase database", () => {
    // The failure mode worth preventing: the harness DROPs schemas CASCADE.
    expect(() => assertDisposableDatabase(supabase)).toThrow(/Refusing/);
  });

  it("refuses other non-test databases", () => {
    for (const name of ["postgres", "britetrack", "production", "app_prod"]) {
      expect(() =>
        assertDisposableDatabase(`postgresql://u@localhost:5432/${name}`),
      ).toThrow(/Refusing/);
    }
  });

  it("refuses names that merely contain the letters 'test'", () => {
    // "test" has to be its own word — a substring match would accept real
    // databases like `attest` or `contest`.
    for (const name of [
      "attest",
      "protest",
      "latest",
      "contest",
      "testimonials",
      "PROTEST",
    ]) {
      expect(() =>
        assertDisposableDatabase(`postgresql://u@localhost:5432/${name}`),
      ).toThrow(/Refusing/);
    }
  });

  it("accepts 'test' as a word regardless of case or separator", () => {
    for (const name of ["TEST", "Britetrack_Test", "app.test.db", "test2"]) {
      expect(() =>
        assertDisposableDatabase(`postgresql://u@localhost:5432/${name}`),
      ).not.toThrow();
    }
  });

  it("refuses an unparseable connection string", () => {
    expect(() => assertDisposableDatabase("not a url")).toThrow(/Refusing/);
  });

  it("names the offending database in the error", () => {
    expect(() => assertDisposableDatabase(supabase)).toThrow(/"postgres"/);
  });

  it("allows any database with an explicit destructive opt-in", () => {
    expect(() =>
      assertDisposableDatabase(supabase, { override: "1" }),
    ).not.toThrow();
    expect(() =>
      assertDisposableDatabase(supabase, { override: "true" }),
    ).not.toThrow();
  });

  it("ignores a non-affirmative override value", () => {
    for (const override of ["", "0", "false", "no"]) {
      expect(() => assertDisposableDatabase(supabase, { override })).toThrow(
        /Refusing/,
      );
    }
  });
});

describe("assertRebuildableContents", () => {
  it("allows an empty database", () => {
    expect(() =>
      assertRebuildableContents(
        { hasHarnessMarker: false, relationCount: 0 },
        "britetrack_test",
      ),
    ).not.toThrow();
  });

  it("allows a database this harness already built", () => {
    expect(() =>
      assertRebuildableContents(
        { hasHarnessMarker: true, relationCount: 12 },
        "britetrack_test",
      ),
    ).not.toThrow();
  });

  it("refuses a populated database the harness does not own", () => {
    // The case a name check alone cannot catch: somebody's real database
    // that happens to be called "test".
    expect(() =>
      assertRebuildableContents(
        { hasHarnessMarker: false, relationCount: 40 },
        "test",
      ),
    ).toThrow(/did not create/);
  });

  it("reports the database name and object count", () => {
    expect(() =>
      assertRebuildableContents(
        { hasHarnessMarker: false, relationCount: 40 },
        "acme_test",
      ),
    ).toThrow(/"acme_test"[\s\S]*40 object/);
  });

  it("allows a populated foreign database with an explicit opt-in", () => {
    expect(() =>
      assertRebuildableContents(
        { hasHarnessMarker: false, relationCount: 40 },
        "test",
        { override: "1" },
      ),
    ).not.toThrow();
  });
});
