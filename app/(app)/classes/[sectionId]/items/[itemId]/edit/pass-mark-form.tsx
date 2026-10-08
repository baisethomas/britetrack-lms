import { setPassMark } from "@/lib/actions/quiz";
import { Button, Card, Input, Label } from "@/components/ui";

/** Percent of available points a student needs to pass the quiz. */
export function PassMarkForm({
  itemId,
  sectionId,
  passMark,
}: {
  itemId: string;
  sectionId: string;
  passMark: number;
}) {
  return (
    <Card>
      <form
        action={async (formData: FormData) => {
          "use server";
          // An empty field would coerce to 0 — a pass mark everyone clears —
          // so it is sent as NaN and rejected rather than silently applied.
          const raw = formData.get("pass_mark");
          await setPassMark(
            itemId,
            sectionId,
            raw === null || String(raw).trim() === "" ? Number.NaN : Number(raw),
          );
        }}
        className="flex flex-wrap items-end gap-4"
      >
        <div>
          <Label htmlFor="pass_mark">Pass mark (%)</Label>
          <Input
            // defaultValue only seeds the DOM on mount; keying on the saved
            // value remounts the input when the stored number changes.
            key={passMark}
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
          Passing completes the quiz and unlocks what follows. Students can retake as often as
          they like.
        </p>
      </form>
    </Card>
  );
}
