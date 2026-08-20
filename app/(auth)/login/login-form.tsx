"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthFormState } from "@/lib/actions/auth";
import { Button, Card, Input, Label } from "@/components/ui";

const initialState: AuthFormState = { error: null };

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, initialState);

  return (
    <Card>
      <h1 className="text-title font-semibold">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">
        Sign in to pick up where you left off.
      </p>
      <form action={action} className="mt-6 space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </Card>
  );
}
