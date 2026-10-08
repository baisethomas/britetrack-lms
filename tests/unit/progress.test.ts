import { describe, expect, it } from "vitest";
import {
  buildStreakDays,
  formatDuration,
  completionPercent,
  computeStreak,
  deriveOutlineState,
  normalisePassMark,
} from "@/lib/progress";

const modules: Parameters<typeof deriveOutlineState>[0] = [
  { id: "m1", position: 1, unlock_mode: "sequential", prerequisite_module_id: null, published: true },
];
const items = [
  { id: "a", module_id: "m1", position: 1, required: true, published: true },
  { id: "b", module_id: "m1", position: 2, required: true, published: true },
  { id: "c", module_id: "m1", position: 3, required: true, published: true },
];
const lockedOf = (done: string[], mods = modules, its = items) =>
  deriveOutlineState(mods, its, new Set(done)).items
    .sort((x, y) => x.position - y.position)
    .map((i) => i.locked);

describe("deriveOutlineState", () => {
  it("opens only the first item when nothing is complete", () => {
    expect(lockedOf([])).toEqual([false, true, true]);
  });

  it("unlocks the item after each completion", () => {
    expect(lockedOf(["a"])).toEqual([false, false, true]);
  });

  it("locks nothing once every item is complete", () => {
    expect(lockedOf(["a", "b", "c"])).toEqual([false, false, false]);
  });

  it("never locks an already-completed item, even out of order", () => {
    // The database prevents out-of-order completions; the derivation must
    // still never hide work a learner has genuinely finished.
    const state = deriveOutlineState(modules, items, new Set(["c"])).items;
    expect(state.find((i) => i.id === "c")).toMatchObject({ completed: true, locked: false });
  });

  it("lets an optional item be skipped without gating what follows", () => {
    const withOptional = items.map((i) => (i.id === "b" ? { ...i, required: false } : i));
    expect(lockedOf(["a"], modules, withOptional)).toEqual([false, false, false]);
  });

  it("opens everything in a free module", () => {
    const free = [{ ...modules[0], unlock_mode: "free" as const }];
    expect(lockedOf([], free)).toEqual([false, false, false]);
  });

  it("locks every item of an unreachable or unpublished module", () => {
    const two = [
      ...modules,
      { id: "m2", position: 2, unlock_mode: "free" as const, prerequisite_module_id: "m1", published: true },
    ];
    const gated = [...items, { id: "d", module_id: "m2", position: 1, required: true, published: true }];
    const before = deriveOutlineState(two, gated, new Set()).items;
    expect(before.find((i) => i.id === "d")?.locked).toBe(true);
    const after = deriveOutlineState(two, gated, new Set(["a", "b", "c"])).items;
    expect(after.find((i) => i.id === "d")?.locked).toBe(false);

    const draft = [{ ...modules[0], published: false }];
    expect(lockedOf([], draft)).toEqual([true, true, true]);
  });

  it("reports module completion from required published items only", () => {
    const mixed = items.map((i) => (i.id === "c" ? { ...i, published: false } : i));
    const state = deriveOutlineState(modules, mixed, new Set(["a", "b"]));
    expect(state.modules[0].completed).toBe(true);
  });

  it("handles an empty section", () => {
    expect(deriveOutlineState([], [], new Set())).toEqual({ modules: [], items: [] });
  });
});

describe("computeStreak", () => {
  const now = new Date("2026-03-15T12:00:00Z");

  it("is zero with no completions", () => {
    expect(computeStreak([], now)).toBe(0);
  });

  it("counts a single completion today", () => {
    expect(computeStreak(["2026-03-15T08:00:00Z"], now)).toBe(1);
  });

  it("counts consecutive days ending today", () => {
    const days = [
      "2026-03-15T08:00:00Z",
      "2026-03-14T22:00:00Z",
      "2026-03-13T09:00:00Z",
    ];
    expect(computeStreak(days, now)).toBe(3);
  });

  it("still counts a streak that ends yesterday", () => {
    // Mid-day: the learner has not studied yet today but has not lapsed.
    const days = ["2026-03-14T22:00:00Z", "2026-03-13T09:00:00Z"];
    expect(computeStreak(days, now)).toBe(2);
  });

  it("is zero once a full day has been missed", () => {
    expect(computeStreak(["2026-03-13T09:00:00Z"], now)).toBe(0);
  });

  it("stops at the first gap", () => {
    const days = [
      "2026-03-15T08:00:00Z",
      "2026-03-14T08:00:00Z",
      // gap on the 13th
      "2026-03-12T08:00:00Z",
      "2026-03-11T08:00:00Z",
    ];
    expect(computeStreak(days, now)).toBe(2);
  });

  it("counts several completions on one day once", () => {
    const days = [
      "2026-03-15T08:00:00Z",
      "2026-03-15T09:00:00Z",
      "2026-03-15T10:00:00Z",
    ];
    expect(computeStreak(days, now)).toBe(1);
  });

  it("does not care about input order", () => {
    const days = [
      "2026-03-13T09:00:00Z",
      "2026-03-15T08:00:00Z",
      "2026-03-14T22:00:00Z",
    ];
    expect(computeStreak(days, now)).toBe(3);
  });

  it("counts across a month boundary", () => {
    const march1 = new Date("2026-03-01T12:00:00Z");
    const days = [
      "2026-03-01T08:00:00Z",
      "2026-02-28T08:00:00Z",
      "2026-02-27T08:00:00Z",
    ];
    expect(computeStreak(days, march1)).toBe(3);
  });
});

describe("completionPercent", () => {
  it("computes a percentage", () => {
    expect(completionPercent(1, 4)).toBe(25);
    expect(completionPercent(3, 3)).toBe(100);
    expect(completionPercent(0, 5)).toBe(0);
  });

  it("returns zero rather than dividing by zero", () => {
    expect(completionPercent(0, 0)).toBe(0);
  });
});

describe("formatDuration", () => {
  it("shows minutes under an hour", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(59)).toBe("59m");
  });

  it("shows whole hours without a minute part", () => {
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(120)).toBe("2h");
  });

  it("combines hours and minutes", () => {
    expect(formatDuration(109)).toBe("1h 49m");
    expect(formatDuration(185)).toBe("3h 5m");
  });

  it("never renders a negative duration", () => {
    expect(formatDuration(-30)).toBe("0m");
  });
});

describe("buildStreakDays", () => {
  // 2026-03-15 is a Sunday.
  const now = new Date("2026-03-15T12:00:00Z");

  it("returns the trailing seven days, oldest first, ending today", () => {
    const days = buildStreakDays([], now);
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe("2026-03-09");
    expect(days[6].date).toBe("2026-03-15");
  });

  it("labels each day with its weekday initial", () => {
    const days = buildStreakDays([], now);
    expect(days.map((d) => d.label)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
  });

  it("flags only the days with a completion", () => {
    const days = buildStreakDays(
      ["2026-03-15T08:00:00Z", "2026-03-13T22:00:00Z"],
      now,
    );
    expect(days.filter((d) => d.active).map((d) => d.date)).toEqual([
      "2026-03-13",
      "2026-03-15",
    ]);
  });

  it("marks exactly one day as today", () => {
    const days = buildStreakDays([], now);
    expect(days.filter((d) => d.isToday).map((d) => d.date)).toEqual([
      "2026-03-15",
    ]);
  });

  it("ignores completions outside the window", () => {
    const days = buildStreakDays(["2026-02-01T08:00:00Z"], now);
    expect(days.every((d) => !d.active)).toBe(true);
  });
});

describe("normalisePassMark", () => {
  it("rejects a value that is not a number", () => {
    // A non-numeric form field arrives as NaN, and NaN survives Math.max and
    // Math.min — clamping alone would pass it straight to the database. The
    // form sends an empty field as NaN too, since "" would otherwise coerce to
    // 0: a pass mark every student clears.
    expect(normalisePassMark(Number.NaN)).toBeNull();
    expect(normalisePassMark(Number("abc"))).toBeNull();
    expect(normalisePassMark(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("clamps to the range the column accepts", () => {
    expect(normalisePassMark(150)).toBe(100);
    expect(normalisePassMark(-10)).toBe(0);
    expect(normalisePassMark(0)).toBe(0);
    expect(normalisePassMark(100)).toBe(100);
  });

  it("rounds to an integer", () => {
    expect(normalisePassMark(85.5)).toBe(86);
    expect(normalisePassMark(70.2)).toBe(70);
  });
});
