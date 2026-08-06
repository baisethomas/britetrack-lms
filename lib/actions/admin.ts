"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data";

async function requireAdmin() {
  const profile = await getProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}

const courseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().default(""),
  category: z.string().default(""),
  sequential_unlock: z.boolean(),
});

export interface AdminFormState {
  error: string | null;
  success?: string | null;
}

export async function createCourse(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const profile = await requireAdmin();
  const parsed = courseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    category: formData.get("category") ?? "",
    sequential_unlock: formData.get("sequential_unlock") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .insert({
      ...parsed.data,
      category: parsed.data.category || null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/admin/courses");
  redirect(`/admin/courses/${data.id}`);
}

export async function setCourseStatus(
  courseId: string,
  status: "draft" | "published" | "archived",
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("courses").update({ status }).eq("id", courseId);
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/courses");
}

const lessonSchema = z.object({
  title: z.string().min(1, "Title is required"),
  summary: z.string().default(""),
  content: z.string().default(""),
  content_type: z.enum(["video", "article", "quiz", "live_session"]),
  video_url: z.string().default(""),
  duration_minutes: z.coerce.number().int().min(0).default(0),
});

export async function addLesson(
  courseId: string,
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const parsed = lessonSchema.safeParse({
    title: formData.get("title"),
    summary: formData.get("summary") ?? "",
    content: formData.get("content") ?? "",
    content_type: formData.get("content_type"),
    video_url: formData.get("video_url") ?? "",
    duration_minutes: formData.get("duration_minutes") || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("lessons")
    .select("position")
    .eq("course_id", courseId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("lessons").insert({
    ...parsed.data,
    video_url: parsed.data.video_url || null,
    course_id: courseId,
    position: (last?.position ?? 0) + 1,
  });
  if (error) return { error: error.message };

  revalidatePath(`/admin/courses/${courseId}`);
  return { error: null, success: "Lesson added" };
}

export async function deleteLesson(lessonId: string, courseId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("lessons").delete().eq("id", lessonId);
  revalidatePath(`/admin/courses/${courseId}`);
}

/**
 * Bulk enrollment from pasted CSV: one email per line, optionally `email,course-title`.
 * When a course id is passed, all rows enroll into that course.
 */
export async function bulkEnroll(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const courseId = String(formData.get("course_id") ?? "");
  const csv = String(formData.get("csv") ?? "").trim();
  if (!courseId) return { error: "Pick a course" };
  if (!csv) return { error: "Paste at least one email" };

  const emails = csv
    .split(/\r?\n/)
    .map((line) => line.split(",")[0].trim().toLowerCase())
    .filter((e) => e.includes("@"));
  if (emails.length === 0) return { error: "No valid email addresses found" };

  const supabase = await createClient();
  const { data: users, error } = await supabase.rpc("find_students_by_email", {
    emails,
  });
  if (error) return { error: error.message };
  if (!users || users.length === 0) {
    return { error: "No matching student accounts found" };
  }

  const rows = users.map((u: { id: string }) => ({
    course_id: courseId,
    student_id: u.id,
  }));
  const { error: insertError } = await supabase
    .from("enrollments")
    .upsert(rows, { onConflict: "course_id,student_id", ignoreDuplicates: true });
  if (insertError) return { error: insertError.message };

  revalidatePath("/admin/enrollments");
  return {
    error: null,
    success: `Enrolled ${users.length} of ${emails.length} students (unmatched emails skipped)`,
  };
}

export async function linkParentStudent(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const parentId = String(formData.get("parent_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  if (!parentId || !studentId) return { error: "Pick a parent and a student" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("parent_student_links")
    .upsert(
      { parent_id: parentId, student_id: studentId },
      { onConflict: "parent_id,student_id", ignoreDuplicates: true },
    );
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { error: null, success: "Parent linked to student" };
}

export async function unlinkParentStudent(
  parentId: string,
  studentId: string,
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("parent_student_links")
    .delete()
    .eq("parent_id", parentId)
    .eq("student_id", studentId);
  revalidatePath("/admin/users");
}

export async function setUserRole(
  userId: string,
  role: "admin" | "student" | "parent",
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("profiles").update({ role }).eq("id", userId);
  revalidatePath("/admin/users");
}
