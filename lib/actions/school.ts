"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSchool } from "@/lib/data";

export interface FormState {
  error: string | null;
  success?: string | null;
  /** Something the admin needs to copy, such as an invitation link. */
  payload?: string | null;
}

/** Administration lives behind RLS; this only keeps the error legible. */
async function requireAdmin() {
  const ctx = await requireSchool();
  if (!ctx.isAdmin) redirect("/dashboard");
  return ctx;
}

const termSchema = z
  .object({
    name: z.string().trim().min(1, "Name the term"),
    starts_on: z.string().min(1, "Pick a start date"),
    ends_on: z.string().min(1, "Pick an end date"),
  })
  .refine((t) => t.ends_on > t.starts_on, {
    message: "The term must end after it starts",
    path: ["ends_on"],
  });

export async function createTerm(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAdmin();
  const parsed = termSchema.safeParse({
    name: formData.get("name"),
    starts_on: formData.get("starts_on"),
    ends_on: formData.get("ends_on"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("terms")
    .insert({ ...parsed.data, school_id: ctx.school.id });
  if (error) return { error: error.message };
  revalidatePath("/admin/school");
  return { error: null, success: `${parsed.data.name} added` };
}

const courseSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().default(""),
  subject: z.string().trim().default(""),
  grade_levels: z.array(z.coerce.number().int().min(-1).max(12)).default([]),
  credits: z.union([z.literal(""), z.coerce.number().min(0).max(10)]).default(""),
});

/** Admins and teachers add to the catalog; a teacher's course is their own. */
export async function createCourse(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireSchool();
  if (!ctx.isAdmin && !ctx.isTeacher) redirect("/dashboard");

  const parsed = courseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    subject: formData.get("subject") ?? "",
    grade_levels: formData.getAll("grade_levels"),
    credits: formData.get("credits") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .insert({
      school_id: ctx.school.id,
      title: parsed.data.title,
      description: parsed.data.description,
      subject: parsed.data.subject || null,
      grade_levels: parsed.data.grade_levels,
      credits: parsed.data.credits === "" ? null : parsed.data.credits,
      created_by: ctx.profile.id,
      // Teachers publish their own courses straight away; the draft state is
      // for a catalog an admin curates ahead of time.
      status: ctx.isAdmin ? "draft" : "published",
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
  await requireSchool();
  const supabase = await createClient();
  await supabase.from("courses").update({ status }).eq("id", courseId);
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${courseId}`);
}

const sectionSchema = z.object({
  course_id: z.string().uuid(),
  term_id: z.string().uuid("Pick a term"),
  name: z.string().trim().min(1, "Name the section, e.g. Period 3"),
});

/** Through create_section(): a teacher is enrolled as its teacher in the same step. */
export async function createSection(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSchool();
  const parsed = sectionSchema.safeParse({
    course_id: formData.get("course_id"),
    term_id: formData.get("term_id"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_section", {
    p_course_id: parsed.data.course_id,
    p_term_id: parsed.data.term_id,
    p_name: parsed.data.name,
  });
  if (error) return { error: error.message };

  revalidatePath("/classes");
  revalidatePath(`/admin/courses/${parsed.data.course_id}`);
  redirect(`/classes/${data as string}`);
}

const inviteSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email address"),
    role: z.enum(["school_admin", "teacher", "student", "guardian", "staff"]),
    grade_level: z.union([z.literal(""), z.coerce.number().int().min(-1).max(12)]).default(""),
    student_id: z.union([z.literal(""), z.string().uuid()]).default(""),
  })
  .refine((i) => i.role !== "student" || i.grade_level !== "", {
    message: "Pick the student's grade",
    path: ["grade_level"],
  })
  .refine((i) => i.role !== "guardian" || i.student_id !== "", {
    message: "Pick the student this guardian belongs to",
    path: ["student_id"],
  });

/**
 * Invite a person by email. The link is returned for the admin to send;
 * only the holder of that email can accept it.
 */
export async function invitePerson(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAdmin();
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    grade_level: formData.get("grade_level") ?? "",
    student_id: formData.get("student_id") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .insert({
      school_id: ctx.school.id,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      grade_level: parsed.data.grade_level === "" ? null : parsed.data.grade_level,
      student_id: parsed.data.student_id === "" ? null : parsed.data.student_id,
      invited_by: ctx.profile.id,
    })
    .select("token")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/admin/people");
  return {
    error: null,
    success: `Invitation created for ${parsed.data.email}`,
    payload: `/join/${data.token}`,
  };
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", invitationId);
  revalidatePath("/admin/people");
}

const gradeSchema = z.coerce.number().int().min(-1).max(12);

export async function setGradeLevel(studentId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = gradeSchema.safeParse(formData.get("grade_level"));
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.from("students").update({ grade_level: parsed.data }).eq("profile_id", studentId);
  revalidatePath("/admin/people");
}

/**
 * Roster students into a section from pasted emails, one per line. They must
 * already be student members of the school; unmatched lines are reported,
 * not silently dropped.
 */
export async function rosterByEmail(
  sectionId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSchool();
  const csv = String(formData.get("emails") ?? "").trim();
  if (!csv) return { error: "Paste at least one email" };

  const emails = [...new Set(
    csv
      .split(/[\r\n,;]+/)
      .map((line) => line.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  )];
  if (emails.length === 0) return { error: "No valid email addresses found" };

  const supabase = await createClient();
  const { data: users, error } = await supabase.rpc("find_school_students_by_email", {
    p_school: ctx.school.id,
    p_emails: emails,
  });
  if (error) return { error: error.message };
  const matched = (users ?? []) as { id: string; email: string }[];
  if (matched.length === 0) return { error: "None of those emails belong to students at this school" };

  const { error: insertError } = await supabase.from("section_enrollments").upsert(
    matched.map((u) => ({ section_id: sectionId, profile_id: u.id, role: "student" })),
    { onConflict: "section_id,profile_id", ignoreDuplicates: true },
  );
  if (insertError) return { error: insertError.message };

  const missing = emails.filter((e) => !matched.some((m) => m.email.toLowerCase() === e));
  revalidatePath(`/classes/${sectionId}`);
  return {
    error: null,
    success:
      `Added ${matched.length} student${matched.length === 1 ? "" : "s"}` +
      (missing.length ? ` — not found: ${missing.join(", ")}` : ""),
  };
}

export async function removeEnrollment(enrollmentId: string, sectionId: string): Promise<void> {
  await requireSchool();
  const supabase = await createClient();
  await supabase.from("section_enrollments").delete().eq("id", enrollmentId);
  revalidatePath(`/classes/${sectionId}`);
}

export async function addStaff(
  sectionId: string,
  profileId: string,
  role: "co_teacher" | "aide",
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("section_enrollments")
    .upsert({ section_id: sectionId, profile_id: profileId, role }, { onConflict: "section_id,profile_id" });
  revalidatePath(`/classes/${sectionId}`);
}
