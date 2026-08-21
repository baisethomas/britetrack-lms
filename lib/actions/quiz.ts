"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data";

const answersSchema = z.array(
  z.object({
    question_id: z.string().uuid(),
    option_ids: z.array(z.string().uuid()),
  }),
);

/**
 * Grade a submission. All scoring happens inside submit_quiz_attempt(), which
 * re-checks lesson access itself — this action only shapes the payload.
 */
export async function submitQuizAttempt(
  lessonId: string,
  courseId: string,
  rawAnswers: unknown,
): Promise<void> {
  const parsed = answersSchema.safeParse(rawAnswers);
  if (!parsed.success) throw new Error("Malformed answers");

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_quiz_attempt", {
    p_lesson_id: lessonId,
    p_answers: parsed.data,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/dashboard");
  redirect(`/courses/${courseId}/lessons/${lessonId}`);
}

const questionSchema = z.object({
  prompt: z.string().min(1, "Enter a question"),
  explanation: z.string().default(""),
  kind: z.enum(["single_choice", "multi_choice"]),
  points: z.coerce.number().int().min(1).default(1),
});

export interface QuizFormState {
  error: string | null;
  success?: string | null;
}

/**
 * Add a question with its options. Option labels arrive as repeated fields,
 * and the correct ones are flagged by index.
 */
export async function addQuizQuestion(
  lessonId: string,
  _prev: QuizFormState,
  formData: FormData,
): Promise<QuizFormState> {
  const profile = await getProfile();
  if (profile.role !== "admin") redirect("/dashboard");

  const parsed = questionSchema.safeParse({
    prompt: formData.get("prompt"),
    explanation: formData.get("explanation") ?? "",
    kind: formData.get("kind"),
    points: formData.get("points") || 1,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // "Correct" is flagged by the option's index in the form, so blank rows have
  // to be dropped without renumbering the ones that remain — compacting first
  // would shift the flags onto the wrong options.
  const correct = new Set(formData.getAll("option_correct").map((v) => String(v)));
  const options = formData
    .getAll("option_label")
    .map((v, formIndex) => ({
      label: String(v).trim(),
      isCorrect: correct.has(String(formIndex)),
    }))
    .filter((o) => o.label !== "");

  // These are checked again inside create_quiz_question(); repeating them here
  // is only so the admin gets a readable message instead of a raised exception.
  if (options.length < 2) return { error: "Add at least two options" };
  const correctCount = options.filter((o) => o.isCorrect).length;
  if (correctCount === 0) return { error: "Mark at least one option correct" };
  if (parsed.data.kind === "single_choice" && correctCount > 1) {
    return { error: "A single-choice question needs exactly one correct option" };
  }

  // One RPC, one transaction: two separate writes could commit the question
  // and then fail on its options, leaving students an unanswerable question.
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_quiz_question", {
    p_lesson_id: lessonId,
    p_prompt: parsed.data.prompt,
    p_explanation: parsed.data.explanation,
    p_kind: parsed.data.kind,
    p_points: parsed.data.points,
    p_labels: options.map((o) => o.label),
    p_correct: options.map((o) => o.isCorrect),
  });
  if (error) return { error: error.message };

  revalidatePath(`/admin/lessons/${lessonId}`);
  return { error: null, success: "Question added" };
}

/**
 * Retire a question. This archives rather than deletes: students who already
 * answered it have a stored score that counted it, and deleting would cascade
 * their answers away, leaving a graded total no breakdown can account for.
 * Archived questions vanish from the player and from future grading.
 */
export async function deleteQuizQuestion(
  questionId: string,
  lessonId: string,
): Promise<void> {
  const profile = await getProfile();
  if (profile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  await supabase
    .from("quiz_questions")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", questionId);
  revalidatePath(`/admin/lessons/${lessonId}`);
}

export async function setLessonPassMark(
  lessonId: string,
  passMark: number,
): Promise<void> {
  const profile = await getProfile();
  if (profile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  await supabase
    .from("lessons")
    .update({ pass_mark: Math.max(0, Math.min(100, Math.round(passMark))) })
    .eq("id", lessonId);
  revalidatePath(`/admin/lessons/${lessonId}`);
}
