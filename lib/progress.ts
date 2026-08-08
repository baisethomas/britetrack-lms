/**
 * Pure progress/unlocking logic, kept free of Supabase so it can be tested
 * directly. `lib/data.ts` fetches the rows and delegates the derivation here.
 */

export interface PositionedLesson {
  id: string;
  position: number;
}

export interface LessonState {
  completed: boolean;
  locked: boolean;
}

/**
 * Annotate lessons (ordered by position) with completed/locked state.
 *
 * A lesson is locked when the course unlocks sequentially and the lesson
 * immediately before it is not complete. An already-completed lesson is never
 * locked, so learners can always revisit finished material.
 */
export function deriveLessonState<T extends PositionedLesson>(
  lessons: readonly T[],
  completedLessonIds: ReadonlySet<string>,
  sequentialUnlock: boolean,
): (T & LessonState)[] {
  let previousCompleted = true;
  return lessons.map((lesson) => {
    const completed = completedLessonIds.has(lesson.id);
    const locked = sequentialUnlock ? !previousCompleted && !completed : false;
    previousCompleted = completed;
    return { ...lesson, completed, locked };
  });
}

/** UTC calendar day (YYYY-MM-DD) of a Date. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Count consecutive UTC days with at least one lesson completion, ending
 * today or yesterday.
 *
 * Yesterday counts as the end of a live streak so a learner who has not
 * studied *yet today* does not see their streak drop to zero mid-day.
 *
 * @param completedAt ISO timestamps of completed lessons, in any order.
 * @param now Reference instant — injected so the result is deterministic.
 */
export function computeStreak(
  completedAt: readonly string[],
  now: Date = new Date(),
): number {
  const days = new Set(completedAt.map((value) => value.slice(0, 10)));
  if (days.size === 0) return 0;

  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/**
 * Percentage complete, 0–100. A course with no lessons reads as 0% rather
 * than dividing by zero.
 */
export function completionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return (completed / total) * 100;
}
