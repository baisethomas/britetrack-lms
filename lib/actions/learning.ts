"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSectionOutline, nextItem, requireSchool } from "@/lib/data";

/** Record that the student opened an item. Idempotent; RLS gates access. */
export async function startItem(itemId: string): Promise<void> {
  const ctx = await requireSchool();
  if (!ctx.isStudent) return;
  const supabase = await createClient();
  await supabase
    .from("module_item_progress")
    .upsert(
      { item_id: itemId, student_id: ctx.profile.id },
      { onConflict: "item_id,student_id", ignoreDuplicates: true },
    );
}

/**
 * Mark a page, video or link complete and move on. Quizzes are completed by
 * passing, never by asking — RLS refuses this for them and the player never
 * offers it.
 */
export async function completeItem(itemId: string, sectionId: string): Promise<void> {
  const ctx = await requireSchool();
  if (!ctx.isStudent) redirect(`/classes/${sectionId}`);

  const supabase = await createClient();
  const { error } = await supabase.from("module_item_progress").upsert(
    { item_id: itemId, student_id: ctx.profile.id, completed_at: new Date().toISOString() },
    { onConflict: "item_id,student_id" },
  );
  if (error) throw new Error(error.message);

  revalidatePath(`/classes/${sectionId}`);
  revalidatePath("/dashboard");

  const outline = await getSectionOutline(sectionId, ctx.profile.id);
  const next = nextItem(outline);
  redirect(next ? `/classes/${sectionId}/items/${next.id}` : `/classes/${sectionId}`);
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/notifications");
}

export async function markAllNotificationsRead(): Promise<void> {
  const ctx = await requireSchool();
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", ctx.profile.id)
    .is("read_at", null);
  revalidatePath("/notifications");
}
