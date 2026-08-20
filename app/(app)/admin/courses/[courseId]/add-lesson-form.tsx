"use client";

import { useActionState } from "react";
import { addLesson, type AdminFormState } from "@/lib/actions/admin";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";

const initialState: AdminFormState = { error: null };

export function AddLessonForm({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState(
    addLesson.bind(null, courseId),
    initialState,
  );

  return (
    <Card>
      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="lesson-title">Title</Label>
          <Input id="lesson-title" name="title" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="content_type">Type</Label>
            <Select id="content_type" name="content_type" defaultValue="article">
              <option value="article">Article</option>
              <option value="video">Video</option>
              <option value="quiz">Quiz</option>
              <option value="live_session">Live session</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="duration_minutes">Duration (min)</Label>
            <Input
              id="duration_minutes"
              name="duration_minutes"
              type="number"
              min={0}
              defaultValue={0}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="video_url">Video URL (embeds, for video lessons)</Label>
          <Input id="video_url" name="video_url" type="url" placeholder="https://…" />
        </div>
        <div>
          <Label htmlFor="summary">Summary</Label>
          <Input id="summary" name="summary" placeholder="One line shown in the curriculum" />
        </div>
        <div>
          <Label htmlFor="content">Content</Label>
          <Textarea id="content" name="content" rows={5} />
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
          {pending ? "Adding…" : "Add lesson"}
        </Button>
      </form>
    </Card>
  );
}
