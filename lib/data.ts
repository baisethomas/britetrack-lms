import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  Course,
  Enrollment,
  Lesson,
  LessonProgress,
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
      supabase.from("lessons").select("id, course_id"),
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

export interface LessonWithState extends Lesson {
  completed: boolean;
  locked: boolean;
}

/** A course's lessons with per-student completed/locked state (sequential unlock). */
export async function getLessonsWithState(
  course: Course,
  studentId: string,
): Promise<LessonWithState[]> {
  const supabase = await createClient();
  const [{ data: lessons }, { data: progress }] = await Promise.all([
    supabase.from("lessons").select("*").eq("course_id", course.id).order("position"),
    supabase.from("lesson_progress").select("*").eq("student_id", studentId),
  ]);

  const completedIds = new Set(
    (progress ?? [])
      .filter((p: LessonProgress) => p.completed_at)
      .map((p: LessonProgress) => p.lesson_id),
  );

  let previousCompleted = true;
  return ((lessons ?? []) as Lesson[]).map((lesson) => {
    const completed = completedIds.has(lesson.id);
    const locked = course.sequential_unlock ? !previousCompleted && !completed : false;
    previousCompleted = completed;
    return { ...lesson, completed, locked };
  });
}

/** Consecutive-day learning streak ending today or yesterday. */
export async function getStreak(studentId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lesson_progress")
    .select("completed_at")
    .eq("student_id", studentId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(365);

  const days = new Set(
    (data ?? []).map((p) => (p.completed_at as string).slice(0, 10)),
  );
  if (days.size === 0) return 0;

  const day = new Date();
  const key = (d: Date) => d.toISOString().slice(0, 10);
  // A streak may end today or yesterday (today's session not done yet).
  if (!days.has(key(day))) day.setUTCDate(day.getUTCDate() - 1);
  let streak = 0;
  while (days.has(key(day))) {
    streak += 1;
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return streak;
}
