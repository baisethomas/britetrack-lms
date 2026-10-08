"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSchool } from "@/lib/data";
import { normalisePassMark } from "@/lib/progress";
import type { FormState } from "@/lib/actions/school";

const answersSchema = z.array(
  z.object({
    question_id: z.string().uuid(),
    option_ids: z.array(z.string().uuid()),
  }),
);

/**
 * Grade a submission. All scoring happens inside submit_quiz_attempt(), which
 * re-checks access itself. Errors are returned rather than thrown: a throw
 * inside the player's transition stops the spinner with nothing shown.
 */
export async function submitQuizAttempt(
  itemId: string,
  sectionId: string,
  rawAnswers: unknown,
): Promise<{ error: string } | void> {
  const parsed = answersSchema.safeParse(rawAnswers);
  if (!parsed.success) return { error: "Those answers could not be read." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_quiz_attempt", {
    p_item_id: itemId,
    p_answers: parsed.data,
  });
  if (error) return { error: error.message };

  revalidatePath(`/classes/${sectionId}/items/${itemId}`);
  revalidatePath(`/classes/${sectionId}`);
  revalidatePath("/dashboard");
  redirect(`/classes/${sectionId}/items/${itemId}`);
}

const questionSchema = z.object({
  prompt: z.string().min(1, "Enter a question"),
  explanation: z.string().default(""),
  kind: z.enum(["single_choice", "multi_choice"]),
  points: z.coerce.number().int().min(1).default(1),
});

/**
 * Add a question with its options through create_quiz_question(), one
 * transaction. The checks here repeat the function's only so the author gets
 * a readable message instead of a raised exception.
 */
export async function addQuizQuestion(
  itemId: string,
  sectionId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSchool();
  const parsed = questionSchema.safeParse({
    prompt: formData.get("prompt"),
    explanation: formData.get("explanation") ?? "",
    kind: formData.get("kind"),
    points: formData.get("points") || 1,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Correctness is flagged by the option's index in the form, so blank rows
  // are dropped without renumbering the ones that remain.
  const correct = new Set(formData.getAll("option_correct").map((v) => String(v)));
  const options = formData
    .getAll("option_label")
    .map((v, formIndex) => ({ label: String(v).trim(), isCorrect: correct.has(String(formIndex)) }))
    .filter((o) => o.label !== "");

  if (options.length < 2) return { error: "Add at least two options" };
  const correctCount = options.filter((o) => o.isCorrect).length;
  if (correctCount === 0) return { error: "Mark at least one option correct" };
  if (parsed.data.kind === "single_choice" && correctCount > 1) {
    return { error: "A single-choice question needs exactly one correct option" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_quiz_question", {
    p_item_id: itemId,
    p_prompt: parsed.data.prompt,
    p_explanation: parsed.data.explanation,
    p_kind: parsed.data.kind,
    p_points: parsed.data.points,
    p_labels: options.map((o) => o.label),
    p_correct: options.map((o) => o.isCorrect),
  });
  if (error) return { error: error.message };

  revalidatePath(`/classes/${sectionId}/items/${itemId}/edit`);
  return { error: null, success: "Question added" };
}

/** Retire a question; past attempts keep it. */
export async function archiveQuizQuestion(
  questionId: string,
  itemId: string,
  sectionId: string,
): Promise<void> {
  await requireSchool();
  const supabase = await createClient();
  await supabase
    .from("quiz_questions")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", questionId)
    .eq("item_id", itemId);
  revalidatePath(`/classes/${sectionId}/items/${itemId}/edit`);
}

export async function setPassMark(
  itemId: string,
  sectionId: string,
  passMark: number,
): Promise<void> {
  await requireSchool();
  const normalised = normalisePassMark(passMark);
  if (normalised === null) throw new Error("Enter a pass mark between 0 and 100");
  const supabase = await createClient();
  await supabase.from("module_items").update({ pass_mark: normalised }).eq("id", itemId);
  revalidatePath(`/classes/${sectionId}/items/${itemId}/edit`);
}
