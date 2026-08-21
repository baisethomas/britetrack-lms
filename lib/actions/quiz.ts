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

  const labels = formData
    .getAll("option_label")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const correct = new Set(formData.getAll("option_correct").map((v) => String(v)));

  if (labels.length < 2) return { error: "Add at least two options" };
  const correctCount = labels.filter((_, i) => correct.has(String(i))).length;
  if (correctCount === 0) return { error: "Mark at least one option correct" };
  if (parsed.data.kind === "single_choice" && correctCount > 1) {
    return { error: "A single-choice question needs exactly one correct option" };
  }

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("quiz_questions")
    .select("position")
    .eq("lesson_id", lessonId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: question, error } = await supabase
    .from("quiz_questions")
    .insert({ ...parsed.data, lesson_id: lessonId, position: (last?.position ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const { error: optionError } = await supabase.from("quiz_options").insert(
    labels.map((label, i) => ({
      question_id: question.id,
      label,
      is_correct: correct.has(String(i)),
      position: i + 1,
    })),
  );
  if (optionError) return { error: optionError.message };

  revalidatePath(`/admin/lessons/${lessonId}`);
  return { error: null, success: "Question added" };
}

export async function deleteQuizQuestion(
  questionId: string,
  lessonId: string,
): Promise<void> {
  const profile = await getProfile();
  if (profile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  await supabase.from("quiz_questions").delete().eq("id", questionId);
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
