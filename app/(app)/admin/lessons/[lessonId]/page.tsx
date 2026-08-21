import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { deleteQuizQuestion } from "@/lib/actions/quiz";
import type { Lesson } from "@/lib/types";
import { Badge, Card } from "@/components/ui";
import { AddQuestionForm } from "./add-question-form";
import { PassMarkForm } from "./pass-mark-form";

interface AuthoredQuestion {
  id: string;
  prompt: string;
  explanation: string;
  kind: "single_choice" | "multi_choice";
  points: number;
  position: number;
  quiz_options: { id: string; label: string; is_correct: boolean; position: number }[];
}

export default async function AdminLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const supabase = await createClient();

  const { data: lesson } = await supabase
    .from("lessons")
    .select("*, courses(id, title)")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) notFound();
  const typed = lesson as Lesson & { courses: { id: string; title: string } | null };

  // Admins read the base tables directly — they are the only role that can.
  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("*, quiz_options(id, label, is_correct, position)")
    .eq("lesson_id", lessonId)
    .is("archived_at", null)
    .order("position");

  const authored = (questions ?? []) as AuthoredQuestion[];
  const isQuiz = typed.content_type === "quiz";

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted">
        <Link href="/admin/courses" className="hover:text-ink">
          Courses
        </Link>
        <ChevronRight className="size-3.5 text-subtle" aria-hidden />
        {typed.courses && (
          <>
            <Link
              href={`/admin/courses/${typed.courses.id}`}
              className="truncate hover:text-ink"
            >
              {typed.courses.title}
            </Link>
            <ChevronRight className="size-3.5 text-subtle" aria-hidden />
          </>
        )}
        <span className="truncate text-ink">{typed.title}</span>
      </nav>

      <div>
        <h1 className="text-display font-bold text-ink">{typed.title}</h1>
        <p className="mt-1 text-sm text-muted capitalize">
          {typed.content_type.replace("_", " ")} lesson
        </p>
      </div>

      {!isQuiz ? (
        <Card>
          <p className="text-sm text-muted">
            Questions can only be added to quiz lessons. Change this lesson&apos;s
            type to <strong>Quiz</strong> to build one.
          </p>
        </Card>
      ) : (
        <>
          <PassMarkForm lessonId={lessonId} passMark={typed.pass_mark} />

          <div>
            <h2 className="mb-3 text-heading font-semibold text-ink">
              Questions ({authored.length})
            </h2>
            <Card className="divide-y divide-line p-0">
              {authored.length === 0 && (
                <p className="p-6 text-sm text-muted">
                  No questions yet — add the first one below.
                </p>
              )}
              {authored.map((question) => (
                <div key={question.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink">
                        {question.position}. {question.prompt}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">
                          {question.kind === "multi_choice"
                            ? "Select all"
                            : "Single answer"}
                        </Badge>
                        <span className="text-xs text-subtle">
                          {question.points}{" "}
                          {question.points === 1 ? "point" : "points"}
                        </span>
                      </div>
                    </div>
                    <form action={deleteQuizQuestion.bind(null, question.id, lessonId)}>
                      <button
                        type="submit"
                        title="Retire question — it stops appearing in the quiz, and past results keep it"
                        className="rounded-control p-2 text-subtle hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="size-4" aria-hidden />
                        <span className="sr-only">Delete {question.prompt}</span>
                      </button>
                    </form>
                  </div>

                  <ul className="mt-3 space-y-1">
                    {[...question.quiz_options]
                      .sort((a, b) => a.position - b.position)
                      .map((option) => (
                        <li
                          key={option.id}
                          className={`flex items-center gap-2 text-sm ${
                            option.is_correct ? "text-success" : "text-muted"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`size-2 shrink-0 rounded-full ${
                              option.is_correct ? "bg-success" : "bg-track"
                            }`}
                          />
                          {option.label}
                          {option.is_correct && (
                            <span className="sr-only">(correct answer)</span>
                          )}
                        </li>
                      ))}
                  </ul>

                  {question.explanation && (
                    <p className="mt-3 rounded-control bg-sunken p-3 text-xs text-muted">
                      {question.explanation}
                    </p>
                  )}
                </div>
              ))}
            </Card>
          </div>

          <div>
            <h2 className="mb-3 text-heading font-semibold text-ink">Add question</h2>
            <AddQuestionForm lessonId={lessonId} />
          </div>
        </>
      )}
    </div>
  );
}
