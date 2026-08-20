"use client";

import { useActionState } from "react";
import { createCourse, type AdminFormState } from "@/lib/actions/admin";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";

const initialState: AdminFormState = { error: null };

export function NewCourseForm() {
  const [state, action, pending] = useActionState(createCourse, initialState);

  return (
    <Card>
      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={4} />
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Input id="category" name="category" placeholder="e.g. Math" />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="sequential_unlock"
            defaultChecked
            className="size-4 rounded border-line accent-accent"
          />
          Unlock lessons sequentially
        </label>
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
