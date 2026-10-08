import { createClient } from "@/lib/supabase/server";
import type {
  QuizAttempt,
  QuizOptionChoice,
  QuizQuestion,
  QuizQuestionPrompt,
  QuizReviewRow,
} from "@/lib/types";

/**
 * The quiz for an item, read from the sanitised views — the answer key is
 * never fetched into the app, only used inside the grading function.
 */
export async function getQuiz(itemId: string): Promise<QuizQuestion[]> {
  const supabase = await createClient();
  const { data: questions } = await supabase
    .from("quiz_question_prompts")
    .select("*")
    .eq("item_id", itemId)
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

/** The student's most recent graded attempt at an item, if any. */
export async function getLatestAttempt(
  itemId: string,
  studentId: string,
): Promise<QuizAttempt | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quiz_attempts")
    .select("*")
    .eq("item_id", itemId)
    .eq("student_id", studentId)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as QuizAttempt) ?? null;
}

/** Per-question breakdown of a graded attempt. */
export async function getAttemptReview(attemptId: string): Promise<QuizReviewRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("quiz_attempt_review", { p_attempt_id: attemptId });
  return (data ?? []) as QuizReviewRow[];
}

/** How many graded attempts the student has made. */
export async function countAttempts(itemId: string, studentId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("quiz_attempts")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId)
    .eq("student_id", studentId)
    .not("submitted_at", "is", null);
  return count ?? 0;
}

export interface AuthoredQuestion {
  id: string;
  prompt: string;
  explanation: string;
  kind: "single_choice" | "multi_choice";
  points: number;
  position: number;
  quiz_options: { id: string; label: string; is_correct: boolean; position: number }[];
}

/** The full question bank with the key — RLS limits this to section staff and admins. */
export async function getAuthoredQuestions(itemId: string): Promise<AuthoredQuestion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quiz_questions")
    .select("*, quiz_options(id, label, is_correct, position)")
    .eq("item_id", itemId)
    .is("archived_at", null)
    .order("position");
  return (data ?? []) as AuthoredQuestion[];
}
