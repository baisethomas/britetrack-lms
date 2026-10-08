"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getContext, SCHOOL_COOKIE } from "@/lib/data";

export interface OnboardingState {
  error: string | null;
}

const schoolSchema = z.object({
  school_name: z.string().trim().min(2, "Enter your school's name"),
  organization_name: z.string().trim().optional(),
});

/** Found a school: the caller becomes its first administrator. */
export async function createSchool(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = schoolSchema.safeParse({
    school_name: formData.get("school_name"),
    organization_name: formData.get("organization_name") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_school", {
    p_school_name: parsed.data.school_name,
    p_organization_name: parsed.data.organization_name || null,
  });
  if (error) return { error: error.message };

  await rememberSchool(data as string);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** Accept an invitation by token; the database checks the email matches. */
export async function acceptInvitation(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Paste your invitation code" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { error: error.message };

  await rememberSchool(data as string);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** Scope the UI to one of the caller's schools. */
export async function switchSchool(schoolId: string): Promise<void> {
  const ctx = await getContext();
  if (!ctx.schools.some((s) => s.id === schoolId)) redirect("/dashboard");
  await rememberSchool(schoolId);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

async function rememberSchool(schoolId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SCHOOL_COOKIE, schoolId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
