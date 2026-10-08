"use client";

import { useActionState } from "react";
import { createSection, type FormState } from "@/lib/actions/school";
import type { Term } from "@/lib/types";
import { Button, Card, Input, Label, Select } from "@/components/ui";

const initialState: FormState = { error: null };

export function NewSectionForm({
  courseId,
  terms,
  isTeacher,
}: {
  courseId: string;
  terms: Term[];
  isTeacher: boolean;
}) {
  const [state, action, pending] = useActionState(createSection, initialState);
  return (
    <Card>
      <form action={action} className="space-y-3">
        <input type="hidden" name="course_id" value={courseId} />
        <div>
          <Label htmlFor="name">Section name</Label>
          <Input id="name" name="name" placeholder="Period 3" required />
        </div>
        <div>
          <Label htmlFor="term_id">Term</Label>
          <Select id="term_id" name="term_id" defaultValue={terms[0]?.id}>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        {isTeacher && (
          <p className="text-xs text-muted">You&apos;ll be enrolled as the section&apos;s teacher.</p>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Opening…" : "Open section"}
        </Button>
      </form>
    </Card>
  );
}
