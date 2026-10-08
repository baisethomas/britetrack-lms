"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTerm, type FormState } from "@/lib/actions/school";
import { Button, Card, Input, Label } from "@/components/ui";

const initialState: FormState = { error: null };

export function TermForm() {
  const [state, action, pending] = useActionState(createTerm, initialState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) ref.current?.reset();
  }, [state]);

  return (
    <Card>
      <form ref={ref} action={action} className="space-y-3">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="Fall 2026" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="starts_on">Starts</Label>
            <Input id="starts_on" name="starts_on" type="date" required />
          </div>
          <div>
            <Label htmlFor="ends_on">Ends</Label>
            <Input id="ends_on" name="ends_on" type="date" required />
          </div>
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
          {pending ? "Adding…" : "Add term"}
        </Button>
      </form>
    </Card>
  );
}
