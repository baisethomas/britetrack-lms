import { createClient } from "@/lib/supabase/server";
import type {
  QuizAttempt,
  QuizOptionChoice,
  QuizQuestion,
  QuizQuestionPrompt,
  QuizReviewRow,
} from "@/lib/types";

/**
 * The quiz for a lesson, read from the sanitised views — the answer key is
 * never fetched into the app, only used inside the grading function.
 */
export async function getQuiz(lessonId: string): Promise<QuizQuestion[]> {
  const supabase = await createClient();

  const { data: questions } = await supabase
    .from("quiz_question_prompts")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("position");

  const prompts = (questions ?? []) as QuizQuestionPrompt[];
  if (prompts.length === 0) return [];

  const { data: options } = await supabase
    .from("quiz_option_choices")
    .select("*")
    .in(
      "question_id",
      prompts.map((q) => q.id),
    )
    .order("position");

  const byQuestion = new Map<string, QuizOptionChoice[]>();
  for (const option of (options ?? []) as QuizOptionChoice[]) {
    const list = byQuestion.get(option.question_id) ?? [];
    list.push(option);
    byQuestion.set(option.question_id, list);
  }

  return prompts.map((q) => ({ ...q, options: byQuestion.get(q.id) ?? [] }));
}

/** The student's most recent graded attempt at a lesson, if any. */
export async function getLatestAttempt(
  lessonId: string,
  studentId: string,
): Promise<QuizAttempt | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quiz_attempts")
    .select("*")
    .eq("lesson_id", lessonId)
    .eq("student_id", studentId)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as QuizAttempt) ?? null;
}

/** Per-question breakdown of a graded attempt. */
export async function getAttemptReview(
  attemptId: string,
): Promise<QuizReviewRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("quiz_attempt_review", {
    p_attempt_id: attemptId,
  });
  return (data ?? []) as QuizReviewRow[];
}

/** How many attempts the student has already made. */
export async function countAttempts(
  lessonId: string,
  studentId: string,
): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("quiz_attempts")
    .select("id", { count: "exact", head: true })
    .eq("lesson_id", lessonId)
    .eq("student_id", studentId)
    .not("submitted_at", "is", null);
  return count ?? 0;
}
