"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { addQuizQuestion, type QuizFormState } from "@/lib/actions/quiz";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";

const initialState: QuizFormState = { error: null };
const MAX_OPTIONS = 6;

export function AddQuestionForm({ lessonId }: { lessonId: string }) {
  const [state, action, pending] = useActionState(
    addQuizQuestion.bind(null, lessonId),
    initialState,
  );
  const [optionCount, setOptionCount] = useState(3);
  const [kind, setKind] = useState<"single_choice" | "multi_choice">("single_choice");

  return (
    <Card>
      {/* Uncontrolled inputs so a successful submit clears the form on remount. */}
      <form action={action} className="space-y-4" key={state.success ?? "form"}>
        <div>
          <Label htmlFor="prompt">Question</Label>
          <Input id="prompt" name="prompt" required placeholder="What does RLS stand for?" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="kind">Answer type</Label>
            <Select
              id="kind"
              name="kind"
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as "single_choice" | "multi_choice")
              }
            >
              <option value="single_choice">Single answer</option>
              <option value="multi_choice">Select all that apply</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="points">Points</Label>
            <Input id="points" name="points" type="number" min={1} defaultValue={1} />
          </div>
        </div>

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink">
            Options — tick the correct {kind === "multi_choice" ? "answers" : "answer"}
          </legend>
          <div className="space-y-2">
            {Array.from({ length: optionCount }, (_, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type={kind === "multi_choice" ? "checkbox" : "radio"}
                  name="option_correct"
                  value={i}
                  aria-label={`Option ${i + 1} is correct`}
                  className="size-4 shrink-0 accent-accent"
                />
                <Input
                  name="option_label"
                  placeholder={`Option ${i + 1}`}
                  aria-label={`Option ${i + 1} label`}
                />
                {optionCount > 2 && i === optionCount - 1 && (
                  <button
                    type="button"
                    onClick={() => setOptionCount((c) => c - 1)}
                    className="rounded-control p-2 text-subtle hover:bg-hover hover:text-ink"
                    title="Remove option"
                  >
                    <X className="size-4" aria-hidden />
                    <span className="sr-only">Remove last option</span>
                  </button>
                )}
              </div>
            ))}
          </div>
          {optionCount < MAX_OPTIONS && (
            <button
              type="button"
              onClick={() => setOptionCount((c) => c + 1)}
              className="mt-2 inline-flex items-center gap-1 text-sm text-ink-accent hover:underline"
            >
              <Plus className="size-3.5" aria-hidden /> Add option
            </button>
          )}
        </fieldset>

        <div>
          <Label htmlFor="explanation">Explanation (shown after grading)</Label>
          <Textarea id="explanation" name="explanation" rows={2} />
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.success && (
          <p role="status" className="text-sm text-success">
            {state.success}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add question"}
        </Button>
      </form>
    </Card>
  );
}
