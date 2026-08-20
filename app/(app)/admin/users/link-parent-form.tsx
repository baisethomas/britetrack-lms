"use client";

import { useActionState } from "react";
import { linkParentStudent, type AdminFormState } from "@/lib/actions/admin";
import { Button, Card, Label, Select } from "@/components/ui";

const initialState: AdminFormState = { error: null };

export interface LinkOption {
  id: string;
  label: string;
}

export function LinkParentForm({
  parents,
  students,
}: {
  parents: LinkOption[];
  students: LinkOption[];
}) {
  const [state, action, pending] = useActionState(linkParentStudent, initialState);

  if (parents.length === 0 || students.length === 0) {
    return null;
  }

  return (
    <Card>
      <h2 className="font-semibold">Link a parent to a student</h2>
      <p className="mt-1 text-sm text-muted">
        Linked parents can see that student&apos;s course progress and streaks.
      </p>
      <form action={action} className="mt-4 flex flex-wrap items-end gap-4">
        <div className="min-w-52 flex-1">
          <Label htmlFor="parent_id">Parent</Label>
          <Select id="parent_id" name="parent_id" required defaultValue="">
            <option value="" disabled>
              Choose a parent…
            </option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-52 flex-1">
          <Label htmlFor="student_id">Student</Label>
          <Select id="student_id" name="student_id" required defaultValue="">
            <option value="" disabled>
              Choose a student…
            </option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Linking…" : "Link"}
        </Button>
        {state.error && (
          <p role="alert" className="w-full text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.success && (
          <p role="status" className="w-full text-sm text-success">
            {state.success}
          </p>
        )}
      </form>
    </Card>
  );
}
