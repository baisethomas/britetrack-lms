"use client";

import { useActionState } from "react";
import { bulkEnroll, type AdminFormState } from "@/lib/actions/admin";
import { Button, Card, Label, Select, Textarea } from "@/components/ui";
import type { Course } from "@/lib/types";

const initialState: AdminFormState = { error: null };

export function BulkEnrollForm({
  courses,
}: {
  courses: Pick<Course, "id" | "title">[];
}) {
  const [state, action, pending] = useActionState(bulkEnroll, initialState);

  return (
    <Card>
      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="course_id">Course</Label>
          <Select id="course_id" name="course_id" required defaultValue="">
            <option value="" disabled>
              Choose a published course…
            </option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="csv">Student emails</Label>
          <Textarea
            id="csv"
            name="csv"
            rows={8}
            required
            placeholder={"ada@example.com\ngrace@example.com"}
          />
          <p className="mt-1 text-xs text-muted">
            One email per line. CSV rows work too — the first column is used.
          </p>
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
          {pending ? "Enrolling…" : "Enroll students"}
        </Button>
      </form>
    </Card>
  );
}
