"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { addItem, addModule, scheduleLiveSession } from "@/lib/actions/sections";
import type { FormState } from "@/lib/actions/school";
import type { ItemKind } from "@/lib/types";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";

const initialState: FormState = { error: null };

/** Reset an uncontrolled form after each successful submission. */
function useResetOnSuccess(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) ref.current?.reset();
  }, [state]);
  return ref;
}

function Feedback({ state }: { state: FormState }) {
  return (
    <>
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
    </>
  );
}

export function AddModuleForm({ sectionId }: { sectionId: string }) {
  const [state, action, pending] = useActionState(addModule.bind(null, sectionId), initialState);
  const ref = useResetOnSuccess(state);
  return (
    <Card>
      <h2 className="font-semibold text-ink">Add a module</h2>
      <form ref={ref} action={action} className="mt-3 space-y-3">
        <div>
          <Label htmlFor="module-title">Title</Label>
          <Input id="module-title" name="title" placeholder="Unit 1: Fractions" required />
        </div>
        <div>
          <Label htmlFor="unlock_mode">Order</Label>
          <Select id="unlock_mode" name="unlock_mode" defaultValue="sequential">
            <option value="sequential">In order — each item unlocks the next</option>
            <option value="free">Free — everything open at once</option>
          </Select>
        </div>
        <Feedback state={state} />
        <Button type="submit" disabled={pending} className="w-full">
          <Plus className="size-4" aria-hidden /> {pending ? "Adding…" : "Add module"}
        </Button>
      </form>
    </Card>
  );
}

export function AddItemForm({ moduleId, sectionId }: { moduleId: string; sectionId: string }) {
  const [state, action, pending] = useActionState(
    addItem.bind(null, moduleId, sectionId),
    initialState,
  );
  const ref = useResetOnSuccess(state);
  const [kind, setKind] = useState<ItemKind>("page");
  const id = (name: string) => `${name}-${moduleId}`;

  return (
    <form ref={ref} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <Label htmlFor={id("title")} className="text-xs">
            New item
          </Label>
          <Input id={id("title")} name="title" placeholder="Title" required />
        </div>
        <div>
          <Label htmlFor={id("kind")} className="text-xs">
            Type
          </Label>
          <Select
            id={id("kind")}
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ItemKind)}
          >
            <option value="page">Reading</option>
            <option value="video">Video</option>
            <option value="quiz">Quiz</option>
            <option value="link">Link</option>
            <option value="live_session">Live class</option>
          </Select>
        </div>
      </div>

      {kind === "video" && (
        <div>
          <Label htmlFor={id("video_url")} className="text-xs">
            Video embed URL
          </Label>
          <Input id={id("video_url")} name="video_url" type="url" placeholder="https://www.youtube.com/embed/…" />
        </div>
      )}
      {kind === "link" && (
        <div>
          <Label htmlFor={id("url")} className="text-xs">
            Link
          </Label>
          <Input id={id("url")} name="url" type="url" placeholder="https://…" required />
        </div>
      )}
      {kind !== "quiz" && kind !== "live_session" && (
        <div>
          <Label htmlFor={id("content")} className="text-xs">
            {kind === "page" ? "Text" : "Notes (optional)"}
          </Label>
          <Textarea id={id("content")} name="content" rows={kind === "page" ? 5 : 2} />
        </div>
      )}
      {kind === "quiz" && (
        <p className="text-xs text-muted">Add the questions after creating it.</p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor={id("duration")} className="mb-0 text-xs">
            Minutes
          </Label>
          <Input id={id("duration")} name="duration_minutes" type="number" min={0} defaultValue={10} className="w-20" />
        </div>
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" name="required" defaultChecked value="on" className="size-4 accent-accent" />
          Required
        </label>
        <input type="hidden" name="required" value="off" />
        <Button type="submit" variant="secondary" disabled={pending} className="ml-auto">
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function ScheduleSessionForm({ sectionId }: { sectionId: string }) {
  const [state, action, pending] = useActionState(
    scheduleLiveSession.bind(null, sectionId),
    initialState,
  );
  const ref = useResetOnSuccess(state);
  return (
    <Card>
      <h2 className="font-semibold text-ink">Schedule a live class</h2>
      <p className="mt-1 text-xs text-muted">
        Paste the Zoom or Google Meet link your school already uses; students get a one-tap
        Join button.
      </p>
      <form ref={ref} action={action} className="mt-3 space-y-3">
        <div>
          <Label htmlFor="session-title">Title</Label>
          <Input id="session-title" name="title" placeholder="Monday class" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="provider">Tool</Label>
            <Select id="provider" name="provider" defaultValue="google_meet">
              <option value="google_meet">Google Meet</option>
              <option value="zoom">Zoom</option>
              <option value="external">Other link</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="duration_minutes">Minutes</Label>
            <Input id="duration_minutes" name="duration_minutes" type="number" min={5} max={480} defaultValue={45} />
          </div>
        </div>
        <div>
          <Label htmlFor="join_url">Meeting link</Label>
          <Input id="join_url" name="join_url" type="url" placeholder="https://meet.google.com/…" required />
        </div>
        <div>
          <Label htmlFor="starts_at">Starts</Label>
          <Input id="starts_at" name="starts_at" type="datetime-local" required />
        </div>
        <Feedback state={state} />
        <Button type="submit" variant="secondary" disabled={pending} className="w-full">
          {pending ? "Scheduling…" : "Schedule"}
        </Button>
      </form>
    </Card>
  );
}
