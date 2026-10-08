/**
 * Pure progress/unlocking logic, kept free of Supabase so it can be tested
 * directly. `lib/data.ts` fetches the rows and delegates the derivation here.
 *
 * The rules mirror can_access_item() in the schema exactly; the database is
 * the authority, and this exists so the UI can show a locked item as locked
 * without a round trip per item.
 */

export interface OutlineModule {
  id: string;
  position: number;
  unlock_mode: "free" | "sequential";
  prerequisite_module_id: string | null;
  published: boolean;
}

export interface OutlineItem {
  id: string;
  module_id: string;
  position: number;
  required: boolean;
  published: boolean;
}

export interface ItemState {
  completed: boolean;
  locked: boolean;
}

export interface ModuleState {
  /** Every required, published item is complete. */
  completed: boolean;
  /** The prerequisite module, if any, is complete. */
  reachable: boolean;
}

/**
 * Annotate a section's modules and items with completed/locked state for one
 * student. An item is locked when its module is unreachable, or when the
 * module is sequential and a required item before it is not complete.
 * Optional items never gate anything. A completed item is never locked, so
 * finished material stays revisitable.
 */
export function deriveOutlineState<M extends OutlineModule, I extends OutlineItem>(
  modules: readonly M[],
  items: readonly I[],
  completedItemIds: ReadonlySet<string>,
): { modules: (M & ModuleState)[]; items: (I & ItemState)[] } {
  const byModule = new Map<string, I[]>();
  for (const item of items) {
    const list = byModule.get(item.module_id) ?? [];
    list.push(item);
    byModule.set(item.module_id, list);
  }
  for (const list of byModule.values()) list.sort((a, b) => a.position - b.position);

  const moduleComplete = (moduleId: string): boolean =>
    (byModule.get(moduleId) ?? []).every(
      (item) => !item.required || !item.published || completedItemIds.has(item.id),
    );

  const annotatedModules = [...modules]
    .sort((a, b) => a.position - b.position)
    .map((module) => ({
      ...module,
      completed: moduleComplete(module.id),
      reachable:
        module.prerequisite_module_id === null ||
        moduleComplete(module.prerequisite_module_id),
    }));
  const moduleById = new Map(annotatedModules.map((m) => [m.id, m]));

  const annotatedItems: (I & ItemState)[] = [];
  for (const [moduleId, list] of byModule) {
    const parent = moduleById.get(moduleId);
    let gateOpen = true;
    for (const item of list) {
      const completed = completedItemIds.has(item.id);
      const reachable = Boolean(parent && parent.published && parent.reachable);
      const locked =
        !completed &&
        (!reachable || (parent?.unlock_mode === "sequential" && !gateOpen));
      annotatedItems.push({ ...item, completed, locked });
      if (item.required && item.published && !completed) gateOpen = false;
    }
  }

  return { modules: annotatedModules, items: annotatedItems };
}

/** UTC calendar day (YYYY-MM-DD) of a Date. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Count consecutive UTC days with at least one completion, ending today or
 * yesterday. Yesterday counts as the end of a live streak so a learner who
 * has not studied *yet today* does not see their streak drop to zero mid-day.
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

/** Percentage complete, 0–100; an empty set reads as 0 rather than dividing by zero. */
export function completionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return (completed / total) * 100;
}

/** Human duration: "45m", "1h", "1h 49m". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export interface StreakDay {
  /** Single-letter weekday, Monday first. */
  label: string;
  /** YYYY-MM-DD (UTC). */
  date: string;
  active: boolean;
  isToday: boolean;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/** The trailing seven UTC days, oldest first, flagged with activity. */
export function buildStreakDays(
  completedAt: readonly string[],
  now: Date = new Date(),
): StreakDay[] {
  const active = new Set(completedAt.map((value) => value.slice(0, 10)));
  const today = dayKey(now);
  return Array.from({ length: 7 }, (_, index) => {
    const cursor = new Date(now);
    cursor.setUTCDate(cursor.getUTCDate() - (6 - index));
    const date = dayKey(cursor);
    return {
      label: WEEKDAY_LABELS[cursor.getUTCDay()],
      date,
      active: active.has(date),
      isToday: date === today,
    };
  });
}

/**
 * A pass mark the database will accept, or null if the input is not a number
 * at all. NaN survives Math.max and Math.min, so it has to be refused rather
 * than clamped.
 */
export function normalisePassMark(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}
