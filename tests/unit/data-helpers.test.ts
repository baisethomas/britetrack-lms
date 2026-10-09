import { describe, expect, it } from "vitest";
import { initialsOf, nextItem, type SectionOutline } from "@/lib/data";

/** The pure helpers in lib/data.ts; the loaders around them need Supabase. */

type Item = SectionOutline["items"][number];
type Mod = SectionOutline["modules"][number];

const mod = (id: string, position: number): Mod => ({
  id,
  section_id: "s",
  title: id,
  position,
  unlock_mode: "sequential",
  prerequisite_module_id: null,
  published: true,
  completed: false,
  reachable: true,
});

const item = (id: string, module_id: string, position: number, state: Partial<Item> = {}): Item => ({
  id,
  module_id,
  section_id: "s",
  position,
  kind: "page",
  title: id,
  summary: "",
  duration_minutes: 0,
  required: true,
  published: true,
  pass_mark: 70,
  completed: false,
  locked: false,
  ...state,
});

const outline = (modules: Mod[], items: Item[]): SectionOutline => ({
  modules,
  items,
  completed: 0,
  total: items.length,
});

describe("nextItem", () => {
  it("picks the first open, unfinished item in module order, then position", () => {
    // Modules listed out of order and items listed out of order: the pick
    // must follow the outline, not the array.
    const o = outline(
      [mod("m2", 2), mod("m1", 1)],
      [
        item("m2-a", "m2", 1),
        item("m1-b", "m1", 2),
        item("m1-a", "m1", 1, { completed: true }),
      ],
    );
    expect(nextItem(o)?.id).toBe("m1-b");
  });

  it("skips locked and unpublished items", () => {
    const o = outline(
      [mod("m1", 1)],
      [
        item("a", "m1", 1, { completed: true }),
        item("b", "m1", 2, { locked: true }),
        item("c", "m1", 3, { published: false }),
        item("d", "m1", 4),
      ],
    );
    expect(nextItem(o)?.id).toBe("d");
  });

  it("returns nothing when everything is done", () => {
    const o = outline([mod("m1", 1)], [item("a", "m1", 1, { completed: true })]);
    expect(nextItem(o)).toBeUndefined();
    expect(nextItem(outline([], []))).toBeUndefined();
  });

  it("moves on to the next module once the current one is finished", () => {
    const o = outline(
      [mod("m1", 1), mod("m2", 2)],
      [item("a", "m1", 1, { completed: true }), item("b", "m2", 1)],
    );
    expect(nextItem(o)?.id).toBe("b");
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the first two words, upper-cased", () => {
    expect(initialsOf("ada lovelace")).toBe("AL");
    expect(initialsOf("Grace Brewster Murray Hopper")).toBe("GB");
    expect(initialsOf("Prince")).toBe("P");
  });

  it("ignores extra whitespace", () => {
    expect(initialsOf("  Ada   Lovelace ")).toBe("AL");
  });

  it("falls back to a placeholder for an empty name", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });
});
