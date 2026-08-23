"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { submitQuizAttempt } from "@/lib/actions/quiz";
import { completionPercent } from "@/lib/progress";
import type { QuizQuestion } from "@/lib/types";
import { Button, Card, Eyebrow, ProgressBar } from "@/components/ui";

/**
 * One question per screen with a progress bar, the shape used by the
 * assessment flows in the reference apps. Selections are held client-side and
 * graded server-side in a single submission — the answer key never reaches
 * the browser, so there is nothing here to inspect.
 */
export function QuizPlayer({
  lessonId,
  courseId,
  passMark,
  questions,
}: {
  lessonId: string;
  courseId: string;
  passMark: number;
  questions: QuizQuestion[];
}) {
  const [index, setIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const question = questions[index];
  const chosen = selections[question.id] ?? [];
  const isLast = index === questions.length - 1;
  const answeredCount = questions.filter(
    (q) => (selections[q.id] ?? []).length > 0,
  ).length;

  function toggle(optionId: string) {
    setSelections((prev) => {
      const current = prev[question.id] ?? [];
      if (question.kind === "single_choice") {
        return { ...prev, [question.id]: [optionId] };
      }
      return {
        ...prev,
        [question.id]: current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      };
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      // A successful submission redirects, so anything returned is a failure.
      const result = await submitQuizAttempt(
        lessonId,
        courseId,
        questions.map((q) => ({
          question_id: q.id,
          option_ids: selections[q.id] ?? [],
        })),
      );
      if (result?.error) setError(result.error);
    });
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <Eyebrow>
          Question {index + 1} of {questions.length}
        </Eyebrow>
        <span className="text-xs text-subtle">Pass mark {passMark}%</span>
      </div>
      <ProgressBar
        value={completionPercent(answeredCount, questions.length)}
        className="mt-3"
      />

      <h2 className="mt-6 text-heading font-semibold text-ink">{question.prompt}</h2>
      <p className="mt-1 text-xs text-subtle">
        {question.kind === "multi_choice"
          ? "Select all that apply."
          : "Select one answer."}
      </p>

      <ul className="mt-4 space-y-2" role="group" aria-label={question.prompt}>
        {question.options.map((option) => {
          const selected = chosen.includes(option.id);
          return (
            <li key={option.id}>
              <button
                type="button"
                role={question.kind === "single_choice" ? "radio" : "checkbox"}
                aria-checked={selected}
                onClick={() => toggle(option.id)}
                className={`flex w-full items-center gap-3 rounded-card border p-4 text-left text-sm transition-colors ${
                  selected
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink"
                }`}
              >
                <span
                  aria-hidden
                  className={`flex size-5 shrink-0 items-center justify-center border ${
                    question.kind === "single_choice" ? "rounded-full" : "rounded"
                  } ${selected ? "border-accent bg-accent text-white" : "border-line-strong"}`}
                >
                  {selected && <Check className="size-3.5" />}
                </span>
                {option.label}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={index === 0 || pending}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Button>

        {isLast ? (
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Grading…
              </>
            ) : (
              <>
                Submit quiz
                {answeredCount < questions.length &&
                  ` (${questions.length - answeredCount} unanswered)`}
              </>
            )}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            disabled={pending}
          >
            Next <ArrowRight className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-control bg-danger-soft p-3 text-sm text-danger"
        >
          {error} Your answers are still selected — try submitting again.
        </p>
      )}
    </Card>
  );
}
