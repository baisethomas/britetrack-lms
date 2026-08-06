"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function enrollInCourse(courseId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("enrollments")
    .insert({ course_id: courseId, student_id: user.id });
  // Unique violation just means already enrolled — treat as success.
  if (error && error.code !== "23505") throw new Error(error.message);

  revalidatePath("/courses");
  revalidatePath(`/courses/${courseId}`);
  redirect(`/courses/${courseId}`);
}

export async function startLesson(lessonId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("lesson_progress")
    .upsert(
      { lesson_id: lessonId, student_id: user.id },
      { onConflict: "lesson_id,student_id", ignoreDuplicates: true },
    );
}

export async function completeLesson(
  lessonId: string,
  courseId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("lesson_progress").upsert(
    {
      lesson_id: lessonId,
      student_id: user.id,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "lesson_id,student_id" },
  );

  // If that was the last lesson, stamp the enrollment as completed.
  const [{ data: lessons }, { data: progress }] = await Promise.all([
    supabase.from("lessons").select("id").eq("course_id", courseId),
    supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("student_id", user.id)
      .not("completed_at", "is", null),
  ]);
  const done = new Set((progress ?? []).map((p) => p.lesson_id));
  if ((lessons ?? []).every((l) => done.has(l.id))) {
    await supabase
      .from("enrollments")
      .update({ completed_at: new Date().toISOString() })
      .eq("course_id", courseId)
      .eq("student_id", user.id);
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/dashboard");
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
  revalidatePath("/notifications");
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  revalidatePath("/notifications");
}
