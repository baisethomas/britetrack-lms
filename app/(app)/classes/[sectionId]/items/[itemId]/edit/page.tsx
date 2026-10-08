import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, Trash2 } from "lucide-react";
import { getSection, getSectionViewRole, requireSchool } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { archiveQuizQuestion } from "@/lib/actions/quiz";
import { getAuthoredQuestions } from "@/lib/quiz";
import type { ModuleItem } from "@/lib/types";
import { Badge, Card } from "@/components/ui";
import { AddQuestionForm } from "./add-question-form";
import { PassMarkForm } from "./pass-mark-form";

export default async function EditQuizPage({
  params,
}: {
  params: Promise<{ sectionId: string; itemId: string }>;
}) {
  const { sectionId, itemId } = await params;
  const ctx = await requireSchool();
  const [section, role] = await Promise.all([getSection(sectionId), getSectionViewRole(ctx, sectionId)]);
  if (!section) notFound();
  if (!(role === "admin" || role === "teacher" || role === "co_teacher")) {
    redirect(`/classes/${sectionId}/items/${itemId}`);
  }

  const supabase = await createClient();
  const { data } = await supabase.from("module_items").select("*").eq("id", itemId).maybeSingle();
  if (!data) notFound();
  const item = data as ModuleItem;
  const questions = item.kind === "quiz" ? await getAuthoredQuestions(itemId) : [];

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted">
        <Link href={`/classes/${sectionId}`} className="truncate hover:text-ink">
          {section.course.title}
        </Link>
        <ChevronRight className="size-3.5 text-subtle" aria-hidden />
        <Link href={`/classes/${sectionId}/build`} className="hover:text-ink">
          Build
        </Link>
        <ChevronRight className="size-3.5 text-subtle" aria-hidden />
        <span className="truncate text-ink">{item.title}</span>
      </nav>

      <div>
        <h1 className="text-display font-bold text-ink">{item.title}</h1>
        <p className="mt-1 text-sm text-muted">Quiz questions and pass mark.</p>
      </div>

      {item.kind !== "quiz" ? (
        <Card>
          <p className="text-sm text-muted">Only quiz items have questions.</p>
        </Card>
      ) : (
        <>
          <PassMarkForm itemId={itemId} sectionId={sectionId} passMark={item.pass_mark} />

          <div>
            <h2 className="mb-3 text-heading font-semibold text-ink">Questions ({questions.length})</h2>
            <Card className="divide-y divide-line p-0">
              {questions.length === 0 && (
                <p className="p-6 text-sm text-muted">No questions yet — add the first one below.</p>
              )}
              {questions.map((question) => (
                <div key={question.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink">
                        {question.position}. {question.prompt}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">
                          {question.kind === "multi_choice" ? "Select all" : "Single answer"}
                        </Badge>
                        <span className="text-xs text-subtle">
                          {question.points} {question.points === 1 ? "point" : "points"}
                        </span>
                      </div>
                    </div>
                    <form action={archiveQuizQuestion.bind(null, question.id, itemId, sectionId)}>
                      <button
                        type="submit"
                        title="Retire question — it leaves the quiz; past results keep it"
                        className="rounded-control p-2 text-subtle hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="size-4" aria-hidden />
                        <span className="sr-only">Retire {question.prompt}</span>
                      </button>
                    </form>
                  </div>
                  <ul className="mt-3 space-y-1">
                    {[...question.quiz_options]
                      .sort((a, b) => a.position - b.position)
                      .map((option) => (
                        <li
                          key={option.id}
                          className={`flex items-center gap-2 text-sm ${option.is_correct ? "text-success" : "text-muted"}`}
                        >
                          <span
                            aria-hidden
                            className={`size-2 shrink-0 rounded-full ${option.is_correct ? "bg-success" : "bg-track"}`}
                          />
                          {option.label}
                          {option.is_correct && <span className="sr-only">(correct answer)</span>}
                        </li>
                      ))}
                  </ul>
                  {question.explanation && (
                    <p className="mt-3 rounded-control bg-sunken p-3 text-xs text-muted">{question.explanation}</p>
                  )}
                </div>
              ))}
            </Card>
          </div>

          <div>
            <h2 className="mb-3 text-heading font-semibold text-ink">Add question</h2>
            <AddQuestionForm itemId={itemId} sectionId={sectionId} />
          </div>
        </>
      )}
    </div>
  );
}
