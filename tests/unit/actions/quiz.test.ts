import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, formData } from "../helpers/supabase-mock";

/**
 * The quiz actions shape form input before handing it to the database
 * functions that enforce the rules. What is under test is that shaping: the
 * database is faked, and the grading function's own checks are covered by
 * tests/db/quiz.test.ts.
 */

const state = vi.hoisted(() => ({
  supabase: null as ReturnType<typeof fakeSupabase> | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => state.supabase),
}));
vi.mock("@/lib/data", () => ({
  requireSchool: vi.fn(async () => ({ profile: { id: "teacher-1" }, isStudent: false })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

const { addQuizQuestion, setPassMark, submitQuizAttempt } = await import("@/lib/actions/quiz");

const ITEM = "11111111-1111-4111-8111-111111111111";
const SECTION = "22222222-2222-4222-8222-222222222222";
const prev = { error: null };

beforeEach(() => {
  state.supabase = fakeSupabase();
});

describe("addQuizQuestion", () => {
  const base = { prompt: "What is 2 + 2?", kind: "single_choice", points: "2" };

  it("sends labels and correctness to create_quiz_question in parallel arrays", async () => {
    const result = await addQuizQuestion(
      ITEM,
      SECTION,
      prev,
      formData({ ...base, option_label: ["3", "4", "5"], option_correct: ["1"] }),
    );
    expect(result).toEqual({ error: null, success: "Question added" });
    expect(state.supabase!.rpc).toHaveBeenCalledWith("create_quiz_question", {
      p_item_id: ITEM,
      p_prompt: "What is 2 + 2?",
      p_explanation: "",
      p_kind: "single_choice",
      p_points: 2,
      p_labels: ["3", "4", "5"],
      p_correct: [false, true, false],
    });
  });

  it("drops blank option rows without shifting which one is marked correct", async () => {
    // The form flags correctness by row index. Deleting the text of row 1
    // must not make row 2's "correct" tick land on what was row 3.
    await addQuizQuestion(
      ITEM,
      SECTION,
      prev,
      formData({ ...base, option_label: ["3", "   ", "4"], option_correct: ["2"] }),
    );
    expect(state.supabase!.rpc).toHaveBeenCalledWith(
      "create_quiz_question",
      expect.objectContaining({ p_labels: ["3", "4"], p_correct: [false, true] }),
    );
  });

  it("trims labels and defaults points to one", async () => {
    await addQuizQuestion(
      ITEM,
      SECTION,
      prev,
      formData({ prompt: "Q", kind: "single_choice", points: "", option_label: [" a ", "b"], option_correct: ["0"] }),
    );
    expect(state.supabase!.rpc).toHaveBeenCalledWith(
      "create_quiz_question",
      expect.objectContaining({ p_points: 1, p_labels: ["a", "b"] }),
    );
  });

  it("refuses a question with fewer than two real options", async () => {
    const result = await addQuizQuestion(
      ITEM,
      SECTION,
      prev,
      formData({ ...base, option_label: ["only", ""], option_correct: ["0"] }),
    );
    expect(result.error).toMatch(/at least two options/i);
    expect(state.supabase!.rpc).not.toHaveBeenCalled();
  });

  it("refuses a question with no correct option", async () => {
    const result = await addQuizQuestion(
      ITEM,
      SECTION,
      prev,
      formData({ ...base, option_label: ["a", "b"] }),
    );
    expect(result.error).toMatch(/at least one option correct/i);
    expect(state.supabase!.rpc).not.toHaveBeenCalled();
  });

  it("refuses two correct options on a single-choice question but allows them on multi-choice", async () => {
    const twoCorrect = { option_label: ["a", "b", "c"], option_correct: ["0", "2"] };
    const single = await addQuizQuestion(ITEM, SECTION, prev, formData({ ...base, ...twoCorrect }));
    expect(single.error).toMatch(/exactly one correct/i);
    expect(state.supabase!.rpc).not.toHaveBeenCalled();

    const multi = await addQuizQuestion(
      ITEM,
      SECTION,
      prev,
      formData({ ...base, kind: "multi_choice", ...twoCorrect }),
    );
    expect(multi.error).toBeNull();
    expect(state.supabase!.rpc).toHaveBeenCalledWith(
      "create_quiz_question",
      expect.objectContaining({ p_kind: "multi_choice", p_correct: [true, false, true] }),
    );
  });

  it("refuses an empty prompt and an unknown kind", async () => {
    const options = { option_label: ["a", "b"], option_correct: ["0"] };
    const noPrompt = await addQuizQuestion(ITEM, SECTION, prev, formData({ ...base, prompt: "", ...options }));
    expect(noPrompt.error).toMatch(/enter a question/i);
    const badKind = await addQuizQuestion(ITEM, SECTION, prev, formData({ ...base, kind: "essay", ...options }));
    expect(badKind.error).toBeTruthy();
    expect(state.supabase!.rpc).not.toHaveBeenCalled();
  });

  it("surfaces the database's refusal as a form error", async () => {
    state.supabase = fakeSupabase({ rpcResult: { data: null, error: { message: "forbidden" } } });
    const result = await addQuizQuestion(
      ITEM,
      SECTION,
      prev,
      formData({ ...base, option_label: ["a", "b"], option_correct: ["0"] }),
    );
    expect(result).toEqual({ error: "forbidden" });
  });
});

describe("submitQuizAttempt", () => {
  const answers = [{ question_id: ITEM, option_ids: [SECTION] }];

  it("grades through submit_quiz_attempt and returns to the item", async () => {
    await expect(submitQuizAttempt(ITEM, SECTION, answers)).rejects.toThrow(
      `REDIRECT /classes/${SECTION}/items/${ITEM}`,
    );
    expect(state.supabase!.rpc).toHaveBeenCalledWith("submit_quiz_attempt", {
      p_item_id: ITEM,
      p_answers: answers,
    });
  });

  it("rejects a malformed payload before it reaches the database", async () => {
    for (const bad of [null, "x", [{ question_id: "not-a-uuid", option_ids: [] }], [{ option_ids: [] }]]) {
      const result = await submitQuizAttempt(ITEM, SECTION, bad);
      expect(result).toEqual({ error: "Those answers could not be read." });
    }
    expect(state.supabase!.rpc).not.toHaveBeenCalled();
  });

  it("returns the grader's error instead of throwing, so the player can show it", async () => {
    state.supabase = fakeSupabase({ rpcResult: { data: null, error: { message: "quiz has no questions" } } });
    await expect(submitQuizAttempt(ITEM, SECTION, answers)).resolves.toEqual({
      error: "quiz has no questions",
    });
  });
});

describe("setPassMark", () => {
  it("clamps and stores a valid mark", async () => {
    await setPassMark(ITEM, SECTION, 150);
    expect(state.supabase!.callsTo("module_items")).toEqual([
      ["update", { pass_mark: 100 }],
      ["eq", "id", ITEM],
    ]);
  });

  it("refuses a mark that is not a number", async () => {
    await expect(setPassMark(ITEM, SECTION, Number.NaN)).rejects.toThrow(/between 0 and 100/);
    expect(state.supabase!.from).not.toHaveBeenCalled();
  });
});
