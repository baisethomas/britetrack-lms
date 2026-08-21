import Link from "next/link";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { completionPercent } from "@/lib/progress";
import type { QuizAttempt, QuizQuestion, QuizReviewRow } from "@/lib/types";
import { Badge, ButtonLink, Card, ProgressBar } from "@/components/ui";

/**
 * Graded attempt: the score, then a per-question breakdown showing what was
 * chosen against the key. Explanations only exist here — the grading function
 * withholds them until an attempt has been submitted.
 */
export function QuizResults({
  attempt,
  review,
  questions,
  passMark,
  retakeHref,
  attemptCount,
  lessonCompleted,
}: {
  attempt: QuizAttempt;
  review: QuizReviewRow[];
  questions: QuizQuestion[];
  passMark: number;
  retakeHref: string;
  attemptCount: number;
  /** True once any attempt has passed — a later failed retake cannot undo it. */
  lessonCompleted: boolean;
}) {
  const percent = completionPercent(attempt.score ?? 0, attempt.max_score ?? 0);
  // Show the threshold this attempt was actually graded against; an admin may
  // have moved the lesson's pass mark since. Older attempts predate the column.
  const appliedPassMark = attempt.pass_mark ?? passMark;
  // A failed retake after an earlier pass: the lesson stays complete, so the
  // headline has to describe the attempt without contradicting that.
  const passedEarlier = lessonCompleted && !attempt.passed;
  const labelFor = new Map(
    questions.flatMap((q) => q.options.map((o) => [o.id, o.label] as const)),
  );

  return (
    <div className="space-y-4">
      <Card
        className={
          attempt.passed || passedEarlier ? "border-success/40" : "border-warning/40"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {attempt.passed || passedEarlier ? (
                <CheckCircle2 className="size-5 text-success" aria-hidden />
              ) : (
                <XCircle className="size-5 text-warning" aria-hidden />
              )}
              <h2 className="text-title font-semibold text-ink">
                {attempt.passed
                  ? "Passed"
                  : passedEarlier
                    ? "This retake fell short"
                    : "Not passed yet"}
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted tabular-nums">
              {attempt.score} of {attempt.max_score} points · {Math.round(percent)}%
              {" · "}
              {appliedPassMark}% needed
            </p>
            {passedEarlier && (
              <p className="mt-1 text-sm text-muted">
                You passed this quiz earlier, so the lesson stays complete.
              </p>
            )}
          </div>
          {!attempt.passed && (
            <ButtonLink href={retakeHref} variant={passedEarlier ? "secondary" : "primary"}>
              <RotateCcw className="size-4" aria-hidden /> Try again
            </ButtonLink>
          )}
        </div>
        <ProgressBar
          value={percent}
          tone={attempt.passed ? "success" : "accent"}
          className="mt-4"
        />
        {attemptCount > 1 && (
          <p className="mt-3 text-xs text-subtle">
            Attempt {attemptCount} · your best result counts.
          </p>
        )}
      </Card>

      <div className="space-y-3">
        {review.map((row) => (
          <Card key={row.question_id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">
                {row.question_position}. {row.prompt}
              </h3>
              <Badge tone={row.is_correct ? "success" : "danger"} className="shrink-0">
                {row.is_correct ? "Correct" : "Incorrect"}
              </Badge>
            </div>

            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex gap-2">
                <dt className="shrink-0 text-subtle">Your answer:</dt>
                <dd className={row.is_correct ? "text-success" : "text-danger"}>
                  {row.selected_option_ids.length === 0
                    ? "Not answered"
                    : row.selected_option_ids
                        .map((id) => labelFor.get(id) ?? "—")
                        .join(", ")}
                </dd>
              </div>
              {!row.is_correct && (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-subtle">Correct answer:</dt>
                  <dd className="text-ink">
                    {row.correct_option_ids
                      .map((id) => labelFor.get(id) ?? "—")
                      .join(", ")}
                  </dd>
                </div>
              )}
            </dl>

            {row.explanation && (
              <p className="mt-3 rounded-control bg-sunken p-3 text-sm text-muted">
                {row.explanation}
              </p>
            )}
          </Card>
        ))}
      </div>

      {(attempt.passed || passedEarlier) && (
        <p className="text-sm text-muted">
          This lesson is complete.{" "}
          <Link href={retakeHref} className="text-ink-accent hover:underline">
            Retake the quiz
          </Link>{" "}
          if you want more practice.
        </p>
      )}
    </div>
  );
}
