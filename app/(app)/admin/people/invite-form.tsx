"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { invitePerson, type FormState } from "@/lib/actions/school";
import { GRADE_LEVELS, gradeLabel, type SchoolRole } from "@/lib/types";
import { Button, Card, Input, Label, Select } from "@/components/ui";

const initialState: FormState = { error: null };

export function InviteForm({ students }: { students: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(invitePerson, initialState);
  const [role, setRole] = useState<SchoolRole>("student");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) ref.current?.reset();
  }, [state]);

  const link =
    state.payload && typeof window !== "undefined"
      ? `${window.location.origin}${state.payload}`
      : state.payload;

  return (
    <Card>
      <h2 className="font-semibold text-ink">Invite someone</h2>
      <form ref={ref} action={action} className="mt-3 space-y-3">
        <div>
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" name="email" type="email" required />
        </div>
        <div>
          <Label htmlFor="invite-role">Role</Label>
          <Select
            id="invite-role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as SchoolRole)}
          >
            <option value="student">Student</option>
            <option value="guardian">Parent / guardian</option>
            <option value="teacher">Teacher</option>
            <option value="school_admin">Administrator</option>
            <option value="staff">Staff</option>
          </Select>
        </div>
        {role === "student" && (
          <div>
            <Label htmlFor="invite-grade">Grade</Label>
            <Select id="invite-grade" name="grade_level" defaultValue="0">
              {GRADE_LEVELS.map((g) => (
                <option key={g} value={g}>
                  {gradeLabel(g)}
                </option>
              ))}
            </Select>
          </div>
        )}
        {role === "guardian" && (
          <div>
            <Label htmlFor="invite-student">Their student</Label>
            <Select id="invite-student" name="student_id" defaultValue="" required>
              <option value="" disabled>
                Pick a student
              </option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
            {students.length === 0 && (
              <p className="mt-1 text-xs text-subtle">Invite the student first.</p>
            )}
          </div>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.success && (
          <div role="status" className="rounded-control bg-success-soft p-3 text-sm text-success">
            <div>{state.success}</div>
            {link && (
              <div className="mt-1">
                Send them this link:{" "}
                <code className="break-all text-xs">{link}</code>
              </div>
            )}
          </div>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create invitation"}
        </Button>
      </form>
      <p className="mt-3 text-xs text-subtle">
        Email sending arrives in a later phase; for now, copy the link and send it yourself.
      </p>
    </Card>
  );
}
