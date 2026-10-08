"use client";

import { useActionState } from "react";
import { rosterByEmail, type FormState } from "@/lib/actions/school";
import { Button, Card, Label, Textarea } from "@/components/ui";

const initialState: FormState = { error: null };

/** Add students by pasting emails. They must already be students at the school. */
export function RosterForm({ sectionId }: { sectionId: string }) {
  const [state, action, pending] = useActionState(
    rosterByEmail.bind(null, sectionId),
    initialState,
  );
  return (
    <Card>
      <form action={action} className="space-y-3">
        <div>
          <Label htmlFor="emails">Add students</Label>
          <Textarea
            id="emails"
            name="emails"
            rows={4}
            placeholder={"one email per line"}
            className="font-mono text-xs"
          />
          <p className="mt-1 text-xs text-subtle">
            Students must already be members of the school — invite them from People first.
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
        <Button type="submit" variant="secondary" disabled={pending} className="w-full">
          {pending ? "Adding…" : "Add to roster"}
        </Button>
      </form>
    </Card>
  );
}
