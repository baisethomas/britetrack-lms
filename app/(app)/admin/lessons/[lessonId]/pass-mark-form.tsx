import { setLessonPassMark } from "@/lib/actions/quiz";
import { Button, Card, Input, Label } from "@/components/ui";

/** Percent of available points a student needs in order to pass the lesson. */
export function PassMarkForm({
  lessonId,
  passMark,
}: {
  lessonId: string;
  passMark: number;
}) {
  return (
    <Card>
      <form
        action={async (formData: FormData) => {
          "use server";
          await setLessonPassMark(lessonId, Number(formData.get("pass_mark")));
        }}
        className="flex flex-wrap items-end gap-4"
      >
        <div>
          <Label htmlFor="pass_mark">Pass mark (%)</Label>
          <Input
            id="pass_mark"
            name="pass_mark"
            type="number"
            min={0}
            max={100}
            defaultValue={passMark}
            className="w-32"
          />
        </div>
        <Button type="submit" variant="secondary">
          Save
        </Button>
        <p className="w-full text-xs text-subtle">
          Passing marks the lesson complete and unlocks the next one. Students can
          retake as often as they like.
        </p>
      </form>
    </Card>
  );
}
