import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildStreakDays,
  computeStreak,
  deriveLessonState,
  type StreakDay,
} from "@/lib/progress";
import type {
  Course,
  Enrollment,
  LessonProgress,
  LessonSummary,
  Profile,
} from "@/lib/types";

/** The signed-in user's profile, or a redirect to /login. Cached per request. */
export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");
  return profile as Profile;
});

export interface CourseWithProgress {
  course: Course;
  enrollment: Enrollment | null;
  totalLessons: number;
  completedLessons: number;
}

/** Published courses annotated with the student's enrollment + progress. */
export async function getCoursesWithProgress(
  studentId: string,
): Promise<CourseWithProgress[]> {
  const supabase = await createClient();

  const [{ data: courses }, { data: enrollments }, { data: lessons }, { data: progress }] =
    await Promise.all([
      supabase.from("courses").select("*").eq("status", "published").order("created_at"),
      supabase.from("enrollments").select("*").eq("student_id", studentId),
      supabase.from("lesson_catalog").select("id, course_id"),
      supabase
        .from("lesson_progress")
        .select("lesson_id, completed_at")
        .eq("student_id", studentId)
        .not("completed_at", "is", null),
    ]);

  const completedIds = new Set((progress ?? []).map((p) => p.lesson_id));
  return (courses ?? []).map((course) => {
    const courseLessons = (lessons ?? []).filter((l) => l.course_id === course.id);
    return {
      course: course as Course,
      enrollment:
        ((enrollments ?? []).find((e) => e.course_id === course.id) as Enrollment) ?? null,
      totalLessons: courseLessons.length,
      completedLessons: courseLessons.filter((l) => completedIds.has(l.id)).length,
    };
  });
}

export interface LessonWithState extends LessonSummary {
  completed: boolean;
  locked: boolean;
}

/**
 * A course's lessons with per-student completed/locked state (sequential
 * unlock). Reads the lesson_catalog view — metadata only; lesson content is
 * fetched separately, gated by RLS.
 */
export async function getLessonsWithState(
  course: Course,
  studentId: string,
): Promise<LessonWithState[]> {
  const supabase = await createClient();
  const [{ data: lessons }, { data: progress }] = await Promise.all([
    supabase
      .from("lesson_catalog")
      .select("*")
      .eq("course_id", course.id)
      .order("position"),
    supabase.from("lesson_progress").select("*").eq("student_id", studentId),
  ]);

  const completedIds = new Set(
    (progress ?? [])
      .filter((p: LessonProgress) => p.completed_at)
      .map((p: LessonProgress) => p.lesson_id),
  );

  return deriveLessonState(
    (lessons ?? []) as LessonSummary[],
    completedIds,
    course.sequential_unlock,
  );
}

export interface StreakSummary {
  /** Consecutive-day streak ending today or yesterday. */
  streak: number;
  /** The trailing seven days, oldest first. */
  days: StreakDay[];
}

/**
 * Streak count plus the week's activity strip, from a single read — the
 * dashboard shows both, and they derive from the same completion dates.
 */
export async function getStreakSummary(
  studentId: string,
): Promise<StreakSummary> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lesson_progress")
    .select("completed_at")
    .eq("student_id", studentId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(365);

  const dates = (data ?? []).map((p) => p.completed_at as string);
  return { streak: computeStreak(dates), days: buildStreakDays(dates) };
}
