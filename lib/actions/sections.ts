"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSchool } from "@/lib/data";
import type { FormState } from "@/lib/actions/school";

/**
 * Section content is a teacher's own; RLS (can_manage_section) is the guard.
 * These actions shape the payload and revalidate.
 */

const moduleSchema = z.object({
  title: z.string().trim().min(1, "Name the module"),
  unlock_mode: z.enum(["free", "sequential"]).default("sequential"),
});

export async function addModule(
  sectionId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSchool();
  const parsed = moduleSchema.safeParse({
    title: formData.get("title"),
    unlock_mode: formData.get("unlock_mode") ?? "sequential",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("modules")
    .select("position")
    .eq("section_id", sectionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("modules").insert({
    ...parsed.data,
    section_id: sectionId,
    position: (last?.position ?? 0) + 1,
  });
  if (error) return { error: error.message };
  revalidate(sectionId);
  return { error: null, success: "Module added" };
}

export async function setModulePublished(
  moduleId: string,
  sectionId: string,
  published: boolean,
): Promise<void> {
  await requireSchool();
  const supabase = await createClient();
  await supabase.from("modules").update({ published }).eq("id", moduleId);
  revalidate(sectionId);
}

export async function setModulePrerequisite(
  moduleId: string,
  sectionId: string,
  formData: FormData,
): Promise<void> {
  await requireSchool();
  const raw = String(formData.get("prerequisite_module_id") ?? "");
  const supabase = await createClient();
  await supabase
    .from("modules")
    .update({ prerequisite_module_id: raw || null })
    .eq("id", moduleId);
  revalidate(sectionId);
}

export async function deleteModule(moduleId: string, sectionId: string): Promise<void> {
  await requireSchool();
  const supabase = await createClient();
  await supabase.from("modules").delete().eq("id", moduleId);
  revalidate(sectionId);
}

const itemSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  kind: z.enum(["page", "video", "quiz", "live_session", "link"]),
  summary: z.string().default(""),
  content: z.string().default(""),
  video_url: z.string().trim().default(""),
  url: z.string().trim().default(""),
  duration_minutes: z.coerce.number().int().min(0).default(0),
  required: z.boolean(),
});

export async function addItem(
  moduleId: string,
  sectionId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSchool();
  const parsed = itemSchema.safeParse({
    title: formData.get("title"),
    kind: formData.get("kind"),
    summary: formData.get("summary") ?? "",
    content: formData.get("content") ?? "",
    video_url: formData.get("video_url") ?? "",
    url: formData.get("url") ?? "",
    duration_minutes: formData.get("duration_minutes") || 0,
    required: formData.get("required") !== "off",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("module_items")
    .select("position")
    .eq("module_id", moduleId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("module_items").insert({
    ...parsed.data,
    video_url: parsed.data.video_url || null,
    url: parsed.data.url || null,
    module_id: moduleId,
    position: (last?.position ?? 0) + 1,
  });
  if (error) return { error: error.message };
  revalidate(sectionId);
  return { error: null, success: `${parsed.data.title} added` };
}

export async function setItemPublished(
  itemId: string,
  sectionId: string,
  published: boolean,
): Promise<void> {
  await requireSchool();
  const supabase = await createClient();
  await supabase.from("module_items").update({ published }).eq("id", itemId);
  revalidate(sectionId);
}

export async function deleteItem(itemId: string, sectionId: string): Promise<void> {
  await requireSchool();
  const supabase = await createClient();
  await supabase.from("module_items").delete().eq("id", itemId);
  revalidate(sectionId);
}

const sessionSchema = z.object({
  title: z.string().trim().min(1, "Give the session a title"),
  provider: z.enum(["zoom", "google_meet", "external"]),
  join_url: z.string().trim().url("Paste the meeting link"),
  starts_at: z.string().min(1, "Pick when it starts"),
  duration_minutes: z.coerce.number().int().min(5).max(480).default(45),
});

/** Bring-your-own meeting: the school's Zoom or Meet link lives on the class page. */
export async function scheduleLiveSession(
  sectionId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSchool();
  const parsed = sessionSchema.safeParse({
    title: formData.get("title"),
    provider: formData.get("provider"),
    join_url: formData.get("join_url"),
    starts_at: formData.get("starts_at"),
    duration_minutes: formData.get("duration_minutes") || 45,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("live_sessions").insert({
    ...parsed.data,
    starts_at: new Date(parsed.data.starts_at).toISOString(),
    section_id: sectionId,
    created_by: ctx.profile.id,
  });
  if (error) return { error: error.message };
  revalidate(sectionId);
  return { error: null, success: "Session scheduled" };
}

export async function deleteLiveSession(sessionId: string, sectionId: string): Promise<void> {
  await requireSchool();
  const supabase = await createClient();
  await supabase.from("live_sessions").delete().eq("id", sessionId);
  revalidate(sectionId);
}

function revalidate(sectionId: string) {
  revalidatePath(`/classes/${sectionId}`);
  revalidatePath(`/classes/${sectionId}/build`);
  revalidatePath("/dashboard");
}
