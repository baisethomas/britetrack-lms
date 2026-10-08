"use client";

import { useActionState } from "react";
import { Building2, Ticket } from "lucide-react";
import {
  acceptInvitation,
  createSchool,
  type OnboardingState,
} from "@/lib/actions/onboarding";
import { Button, Card, Input, Label } from "@/components/ui";

const initialState: OnboardingState = { error: null };

export function AcceptInvitationForm({ token }: { token?: string }) {
  const [state, action, pending] = useActionState(acceptInvitation, initialState);
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Ticket className="size-5" aria-hidden />
        </div>
        <div>
          <h2 className="text-heading font-semibold text-ink">Join a school</h2>
          <p className="text-sm text-muted">
            Your school sent you an invitation link or code. It only works for the
            email address it was sent to.
          </p>
        </div>
      </div>
      <form action={action} className="mt-5 space-y-3">
        <div>
          <Label htmlFor="token">Invitation code</Label>
          <Input
            id="token"
            name="token"
            defaultValue={token ?? ""}
            placeholder="Paste the code from your invitation"
            required
            autoComplete="off"
          />
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Joining…" : "Join school"}
        </Button>
      </form>
    </Card>
  );
}

export function CreateSchoolForm() {
  const [state, action, pending] = useActionState(createSchool, initialState);
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Building2 className="size-5" aria-hidden />
        </div>
        <div>
          <h2 className="text-heading font-semibold text-ink">Set up a new school</h2>
          <p className="text-sm text-muted">
            You&apos;ll be its first administrator and can invite teachers, students
            and families next.
          </p>
        </div>
      </div>
      <form action={action} className="mt-5 space-y-3">
        <div>
          <Label htmlFor="school_name">School name</Label>
          <Input id="school_name" name="school_name" placeholder="Hillside Elementary" required />
        </div>
        <div>
          <Label htmlFor="organization_name">District or network (optional)</Label>
          <Input
            id="organization_name"
            name="organization_name"
            placeholder="Leave blank for an independent school"
          />
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" variant="secondary" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create school"}
        </Button>
      </form>
    </Card>
  );
}
