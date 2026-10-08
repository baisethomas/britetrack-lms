"use client";

import { useActionState } from "react";
import { createCourse, type FormState } from "@/lib/actions/school";
import { gradeLabel } from "@/lib/types";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";

const initialState: FormState = { error: null };

export function NewCourseForm({ gradeMin, gradeMax }: { gradeMin: number; gradeMax: number }) {
  const [state, action, pending] = useActionState(createCourse, initialState);
  const grades = Array.from({ length: gradeMax - gradeMin + 1 }, (_, i) => gradeMin + i);

  return (
    <Card>
      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" placeholder="Algebra I" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" name="subject" placeholder="Math" />
          </div>
          <div>
            <Label htmlFor="credits">Credits (high school)</Label>
            <Input id="credits" name="credits" type="number" step="0.5" min={0} max={10} placeholder="1" />
          </div>
        </div>
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink">Grade levels</legend>
          <div className="flex flex-wrap gap-2">
            {grades.map((g) => (
              <label
                key={g}
                className="flex items-center gap-1.5 rounded-control border border-line px-2.5 py-1.5 text-sm text-ink has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
              >
                <input type="checkbox" name="grade_levels" value={g} className="size-3.5 accent-accent" />
                {gradeLabel(g)}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={3} />
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create course"}
        </Button>
      </form>
    </Card>
  );
}
