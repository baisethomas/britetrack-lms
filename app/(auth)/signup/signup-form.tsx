"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { GraduationCap, Users } from "lucide-react";
import { signUp, type AuthFormState } from "@/lib/actions/auth";
import { Button, Card, Input, Label } from "@/components/ui";

const initialState: AuthFormState = { error: null };

const roles = [
  {
    value: "student",
    label: "I'm a student",
    description: "Take courses and track my progress",
    icon: GraduationCap,
  },
  {
    value: "parent",
    label: "I'm a parent",
    description: "Follow my child's learning",
    icon: Users,
  },
] as const;

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initialState);
  const [role, setRole] = useState<"student" | "parent">("student");

  return (
    <Card>
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-slate-500">
        Start with the role that fits you — admins are invited separately.
      </p>
      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="role" value={role} />
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Account type">
          {roles.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={role === r.value}
              onClick={() => setRole(r.value)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                role === r.value
                  ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <r.icon className="mb-2 size-5 text-brand-600" aria-hidden />
              <div className="text-sm font-medium">{r.label}</div>
              <div className="mt-0.5 text-xs text-slate-500">{r.description}</div>
            </button>
          ))}
        </div>
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
          <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-rose-600">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
