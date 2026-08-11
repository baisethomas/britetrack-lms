import { describe, expect, it } from "vitest";
import {
  completionPercent,
  computeStreak,
  deriveLessonState,
} from "@/lib/progress";

const lessons = [
  { id: "a", position: 1 },
  { id: "b", position: 2 },
  { id: "c", position: 3 },
];

describe("deriveLessonState", () => {
  it("opens only the first lesson when nothing is complete", () => {
    const state = deriveLessonState(lessons, new Set(), true);
    expect(state.map((l) => l.locked)).toEqual([false, true, true]);
    expect(state.every((l) => !l.completed)).toBe(true);
  });

  it("unlocks the lesson after each completion", () => {
    const state = deriveLessonState(lessons, new Set(["a"]), true);
    expect(state.map((l) => l.locked)).toEqual([false, false, true]);
    expect(state.map((l) => l.completed)).toEqual([true, false, false]);
  });

  it("locks nothing once every lesson is complete", () => {
    const state = deriveLessonState(lessons, new Set(["a", "b", "c"]), true);
    expect(state.every((l) => !l.locked)).toBe(true);
  });

  it("never locks an already-completed lesson, even out of order", () => {
    // Defensive: the database now prevents out-of-order completions, but the
    // derivation must not hide work a learner has genuinely finished.
    const state = deriveLessonState(lessons, new Set(["c"]), true);
    expect(state[2]).toMatchObject({ id: "c", completed: true, locked: false });
  });

  it("resumes locking after an out-of-order completion", () => {
    const state = deriveLessonState(lessons, new Set(["b"]), true);
    // "a" is open (first), "b" is complete, "c" follows a completed lesson.
    expect(state.map((l) => l.locked)).toEqual([false, false, false]);
  });

  it("locks nothing when the course does not unlock sequentially", () => {
    const state = deriveLessonState(lessons, new Set(), false);
    expect(state.every((l) => !l.locked)).toBe(true);
  });

  it("preserves the source lesson fields", () => {
    const rich = [{ id: "a", position: 1, title: "Intro", duration: 5 }];
    const [state] = deriveLessonState(rich, new Set(), true);
    expect(state).toMatchObject({ id: "a", title: "Intro", duration: 5 });
  });

  it("handles an empty course", () => {
    expect(deriveLessonState([], new Set(), true)).toEqual([]);
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
