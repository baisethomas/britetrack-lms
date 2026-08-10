import { describe, expect, it } from "vitest";
import {
  assertDisposableDatabase,
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
