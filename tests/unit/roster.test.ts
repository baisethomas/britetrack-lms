import { describe, expect, it } from "vitest";
import { parseEmailList } from "@/lib/roster";

describe("parseEmailList", () => {
  it("splits on newlines, commas and semicolons", () => {
    expect(parseEmailList("a@x.test\nb@x.test,c@x.test;d@x.test\r\ne@x.test")).toEqual([
      "a@x.test",
      "b@x.test",
      "c@x.test",
      "d@x.test",
      "e@x.test",
    ]);
  });

  it("lower-cases and trims each address", () => {
    expect(parseEmailList("  Ada@Example.COM \n")).toEqual(["ada@example.com"]);
  });

  it("drops duplicates, including ones that differ only by case", () => {
    expect(parseEmailList("a@x.test\nA@X.TEST\na@x.test")).toEqual(["a@x.test"]);
  });

  it("drops lines that are not addresses", () => {
    expect(parseEmailList("Ada Lovelace\n\n,,\nada@x.test")).toEqual(["ada@x.test"]);
    expect(parseEmailList("")).toEqual([]);
  });
});
