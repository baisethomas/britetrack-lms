"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthFormState } from "@/lib/actions/auth";
import { Button, Card, Input, Label } from "@/components/ui";

const initialState: AuthFormState = { error: null };

/**
 * No role picker: a role comes from founding a school or from an invitation,
 * so signup only needs a name and credentials.
 */
export function SignupForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signUp, initialState);
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <Card>
      <h1 className="text-title font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-muted">
        Then set up your school, or join one with the invitation you were sent.
      </p>
      <form action={action} className="mt-6 space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" autoComplete="name" required />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
