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

  // RLS (can_access_lesson) rejects locked or un-enrolled lessons; the
  // sync_enrollment_completion trigger stamps course completion.
  const { error } = await supabase.from("lesson_progress").upsert(
    {
      lesson_id: lessonId,
      student_id: user.id,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "lesson_id,student_id" },
  );
  if (error) throw new Error(error.message);

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/dashboard");

  // Continue straight to the next lesson, or back to the course when done.
  const { data: lesson } = await supabase
    .from("lessons")
    .select("position")
    .eq("id", lessonId)
    .single();
  const { data: next } = await supabase
    .from("lessons")
    .select("id")
    .eq("course_id", courseId)
    .gt("position", lesson?.position ?? 0)
    .order("position")
    .limit(1)
    .maybeSingle();

  redirect(
    next
      ? `/courses/${courseId}/lessons/${next.id}`
      : `/courses/${courseId}`,
  );
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
