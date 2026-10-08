import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback, type TestDb } from "./harness";
import {
  addMember,
  answerPayload,
  completeItem,
  linkGuardian,
  seedClassroom,
  seedItem,
  seedQuizItem,
} from "./fixtures";

beforeAll(connect);
afterAll(disconnect);

/** A classroom whose first module is a free-unlock quiz the student can reach. */
async function quizClassroom(db: TestDb, questionCount = 2, passMark = 70) {
  const room = await seedClassroom(db, { itemCount: 0, unlock: "free" });
  const quiz = await seedQuizItem(db, room.moduleId, { questionCount, passMark, position: 1 });
  return { ...room, quiz };
}

async function submit(
  db: TestDb,
  who: string,
  itemId: string,
  payload: string,
): Promise<string> {
  const [row] = await db.asUser(who, (q) =>
    q.run<{ submit_quiz_attempt: string }>("select public.submit_quiz_attempt($1, $2::jsonb)", [
      itemId,
      payload,
    ]),
  );
  return row.submit_quiz_attempt;
}

async function attempt(db: TestDb, id: string) {
  const [row] = await db.seed<{
    score: number;
    max_score: number;
    pass_mark: number;
    passed: boolean;
  }>("select score, max_score, pass_mark, passed from public.quiz_attempts where id = $1", [id]);
  return row;
}

describe("answer key confidentiality", () => {
  it("does not expose is_correct or explanations through the student-facing views", async () => {
    await withRollback(async (db) => {
      const { student } = await quizClassroom(db);
      const columns = await db.asUser(student, (q) =>
        q.run<{ column_name: string }>(
          `select column_name from information_schema.columns
           where table_schema = 'public'
             and table_name in ('quiz_question_prompts', 'quiz_option_choices')`,
        ),
      );
      const names = columns.map((c) => c.column_name);
      expect(names).not.toContain("is_correct");
      expect(names).not.toContain("explanation");
      expect(names).toContain("label");
    });
  });

  it("yields no answer-key rows on a direct read by a student", async () => {
    // The barrier is RLS, not the grant: a student matches no policy and must
    // come away with nothing. Asserting on rows rather than on an error is
    // deliberate — an error would also pass if the key were readable by some
    // other route.
    await withRollback(async (db) => {
      const { student } = await quizClassroom(db);
      for (const table of ["quiz_options", "quiz_questions"]) {
        const result = await db.asUser(student, (q) =>
          q.attempt(`select * from public.${table}`),
        );
        expect(result.ok && result.rows.length > 0).toBe(false);
      }
    });
  });

  it("keeps the key from a student who tries to write it", async () => {
    await withRollback(async (db) => {
      const { student, quiz } = await quizClassroom(db);
      const flipped = await db.asUser(student, (q) =>
        q.attempt(
          "update public.quiz_options set is_correct = true where question_id = $1 returning id",
          [quiz.questionIds[0]],
        ),
      );
      expect(flipped.ok && flipped.rows.length > 0).toBe(false);
      const inserted = await db.asUser(student, (q) =>
        q.attempt(
          "insert into public.quiz_questions (item_id, prompt, position) values ($1, 'mine', 99) returning id",
          [quiz.itemId],
        ),
      );
      expect(inserted.ok && inserted.rows.length > 0).toBe(false);
    });
  });

  it("lets the section's teacher author questions and options through their own session", async () => {
    // Every signed-in caller is `authenticated`, so this is the positive
    // counterpart that would catch a lockdown that also caught teachers.
    await withRollback(async (db) => {
      const { teacher, quiz } = await quizClassroom(db);
      const existing = await db.asUser(teacher, (q) =>
        q.run("select id, is_correct from public.quiz_options"),
      );
      expect(existing.length).toBeGreaterThan(0);

      const [created] = await db.asUser(teacher, (q) =>
        q.run<{ create_quiz_question: string }>(
          `select public.create_quiz_question($1, 'Which?', '', 'single_choice', 1,
             array['A', 'B'], array[false, true])`,
          [quiz.itemId],
        ),
      );
      const archived = await db.asUser(teacher, (q) =>
        q.run<{ id: string }>(
          "update public.quiz_questions set archived_at = now() where id = $1 returning id",
          [created.create_quiz_question],
        ),
      );
      expect(archived).toHaveLength(1);
    });
  });

  it("keeps a colleague out of a quiz in a section they do not teach", async () => {
    await withRollback(async (db) => {
      const { schoolId, quiz } = await quizClassroom(db);
      const colleague = await db.createUser({ email: "colleague@s1.test" });
      await addMember(db, schoolId, colleague, "teacher");
      const rows = await db.asUser(colleague, (q) =>
        q.run("select id from public.quiz_questions where item_id = $1", [quiz.itemId]),
      );
      expect(rows).toHaveLength(0);
      const result = await db.asUser(colleague, (q) =>
        q.attempt(
          `select public.create_quiz_question($1, 'X', '', 'single_choice', 1,
             array['A', 'B'], array[true, false])`,
          [quiz.itemId],
        ),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });
  });

  it("refuses even a teacher's direct delete, so scored attempts stay explicable", async () => {
    await withRollback(async (db) => {
      const { student, teacher, quiz } = await quizClassroom(db, 1);
      const id = await submit(db, student, quiz.itemId, answerPayload(quiz.questionIds, quiz.correctIds));
      const deleted = await db.asUser(teacher, (q) =>
        q.attempt("delete from public.quiz_questions where id = $1 returning id", [
          quiz.questionIds[0],
        ]),
      );
      expect(deleted.ok && deleted.rows.length > 0).toBe(false);
      const review = await db.asUser(student, (q) =>
        q.run<{ correct_labels: string[] }>(
          "select correct_labels from public.quiz_attempt_review($1)",
          [id],
        ),
      );
      expect(review[0].correct_labels).toEqual(["Option 1"]);
    });
  });

  it("lets an enrolled student read prompts and choices", async () => {
    await withRollback(async (db) => {
      const { student, quiz } = await quizClassroom(db);
      const prompts = await db.asUser(student, (q) =>
        q.run("select id from public.quiz_question_prompts"),
      );
      expect(prompts).toHaveLength(quiz.questionIds.length);
      const choices = await db.asUser(student, (q) =>
        q.run("select id from public.quiz_option_choices"),
      );
      expect(choices).toHaveLength(quiz.questionIds.length * 3);
    });
  });
});

describe("grading", () => {
  it("scores a fully correct submission, records the pass mark and passes", async () => {
    await withRollback(async (db) => {
      const { student, quiz } = await quizClassroom(db);
      const id = await submit(db, student, quiz.itemId, answerPayload(quiz.questionIds, quiz.correctIds));
      expect(await attempt(db, id)).toMatchObject({
        score: 2,
        max_score: 2,
        pass_mark: 70,
        passed: true,
      });
    });
  });

  it("scores a wrong submission and fails, treating unanswered as wrong", async () => {
    await withRollback(async (db) => {
      const { student, quiz } = await quizClassroom(db);
      const id = await submit(
        db,
        student,
        quiz.itemId,
        answerPayload(quiz.questionIds, [[quiz.wrongIds[0][0]], []]),
      );
      expect(await attempt(db, id)).toMatchObject({ score: 0, passed: false });
    });
  });

  it("keeps the applied pass mark when the item's threshold moves later", async () => {
    await withRollback(async (db) => {
      const { student, quiz } = await quizClassroom(db, 2, 50);
      const id = await submit(
        db,
        student,
        quiz.itemId,
        answerPayload(quiz.questionIds, [quiz.correctIds[0], quiz.wrongIds[1]]),
      );
      await db.seed("update public.module_items set pass_mark = 100 where id = $1", [quiz.itemId]);
      expect(await attempt(db, id)).toMatchObject({ pass_mark: 50, passed: true });
    });
  });

  it("requires an exact match on a multi-choice question", async () => {
    await withRollback(async (db) => {
      const { student, quiz } = await quizClassroom(db, 1);
      await db.seed("update public.quiz_options set is_correct = true where id = $1", [
        quiz.wrongIds[0][0],
      ]);
      await db.seed("update public.quiz_questions set kind = 'multi_choice' where id = $1", [
        quiz.questionIds[0],
      ]);
      const partial = await submit(db, student, quiz.itemId, answerPayload(quiz.questionIds, [quiz.correctIds[0]]));
      expect((await attempt(db, partial)).score).toBe(0);
      const exact = await submit(
        db,
        student,
        quiz.itemId,
        answerPayload(quiz.questionIds, [[...quiz.correctIds[0], quiz.wrongIds[0][0]]]),
      );
      expect((await attempt(db, exact)).score).toBe(1);
    });
  });

  it("discards option ids that belong to another question", async () => {
    await withRollback(async (db) => {
      const { student, quiz } = await quizClassroom(db);
      const id = await submit(
        db,
        student,
        quiz.itemId,
        answerPayload(quiz.questionIds, [quiz.correctIds[1], quiz.correctIds[0]]),
      );
      expect((await attempt(db, id)).score).toBe(0);
    });
  });

  it("treats a repeated question_id as the union of its selections", async () => {
    await withRollback(async (db) => {
      const { student, quiz } = await quizClassroom(db, 1);
      const split = JSON.stringify([
        { question_id: quiz.questionIds[0], option_ids: [quiz.correctIds[0][0]] },
        { question_id: quiz.questionIds[0], option_ids: [quiz.wrongIds[0][1]] },
      ]);
      const id = await submit(db, student, quiz.itemId, split);
      expect((await attempt(db, id)).score).toBe(0);
    });
  });

  it("refuses an unenrolled student, a linked guardian, and a locked item", async () => {
    await withRollback(async (db) => {
      const { student, schoolId, sectionId, quiz } = await quizClassroom(db);
      const other = await db.createUser({ email: "other@s1.test" });
      await addMember(db, schoolId, other, "student");
      const guardian = await db.createUser({ email: "guardian@s1.test" });
      await addMember(db, schoolId, guardian, "guardian");
      await linkGuardian(db, guardian, student);

      for (const who of [other, guardian]) {
        const result = await db.asUser(who, (q) =>
          q.attempt("select public.submit_quiz_attempt($1, $2::jsonb)", [
            quiz.itemId,
            answerPayload(quiz.questionIds, quiz.correctIds),
          ]),
        );
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/forbidden/i);
      }

      await db.seed("update public.modules set unlock_mode = 'sequential' where section_id = $1", [
        sectionId,
      ]);
      const gate = await seedItem(db, (await moduleOf(db, quiz.itemId)), { position: 0 });
      void gate;
      const locked = await db.asUser(student, (q) =>
        q.attempt("select public.submit_quiz_attempt($1, $2::jsonb)", [
          quiz.itemId,
          answerPayload(quiz.questionIds, quiz.correctIds),
        ]),
      );
      expect(locked.ok).toBe(false);
    });
  });

  it("refuses to grade an item that is not a quiz", async () => {
    await withRollback(async (db) => {
      const { student, moduleId } = await seedClassroom(db, { itemCount: 1, unlock: "free" });
      const [page] = await db.seed<{ id: string }>(
        "select id from public.module_items where module_id = $1",
        [moduleId],
      );
      await db.seed(
        "insert into public.quiz_questions (item_id, prompt, position) values ($1, 'Stray', 1)",
        [page.id],
      );
      const result = await db.asUser(student, (q) =>
        q.attempt("select public.submit_quiz_attempt($1, '[]'::jsonb)", [page.id]),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not a quiz item/i);
    });
  });

  it("drops an archived question from grading and from the student's view, keeping past reviews", async () => {
    await withRollback(async (db) => {
      const { student, quiz } = await quizClassroom(db);
      const before = await submit(db, student, quiz.itemId, answerPayload(quiz.questionIds, quiz.correctIds));
      await db.seed("update public.quiz_questions set archived_at = now() where id = $1", [
        quiz.questionIds[1],
      ]);
      const prompts = await db.asUser(student, (q) =>
        q.run("select id from public.quiz_question_prompts"),
      );
      expect(prompts).toHaveLength(1);

      const after = await submit(db, student, quiz.itemId, answerPayload([quiz.questionIds[0]], [quiz.correctIds[0]]));
      expect(await attempt(db, after)).toMatchObject({ max_score: 1, passed: true });

      const review = await db.asUser(student, (q) =>
        q.run<{ selected_labels: string[] }>(
          "select selected_labels from public.quiz_attempt_review($1)",
          [before],
        ),
      );
      expect(review).toHaveLength(2);
      expect(review[1].selected_labels).toEqual(["Option 1"]);
    });
  });

  it("does not let a question without options block a pass", async () => {
    await withRollback(async (db) => {
      const { student, quiz } = await quizClassroom(db, 1);
      await db.seed(
        "insert into public.quiz_questions (item_id, prompt, position) values ($1, 'Half-authored', 50)",
        [quiz.itemId],
      );
      const id = await submit(db, student, quiz.itemId, answerPayload(quiz.questionIds, quiz.correctIds));
      expect(await attempt(db, id)).toMatchObject({ max_score: 1, passed: true });
    });
  });
});

describe("authoring a question", () => {
  it("leaves nothing behind when the options are invalid", async () => {
    await withRollback(async (db) => {
      const { teacher, quiz } = await quizClassroom(db, 0);
      for (const [labels, correct, message] of [
        ["array['A']", "array[true]", /at least two options/i],
        ["array['A', 'B']", "array[false, false]", /at least one correct/i],
        ["array['A', 'B']", "array[true, true]", /single-choice/i],
      ] as const) {
        const result = await db.asUser(teacher, (q) =>
          q.attempt(
            `select public.create_quiz_question($1, 'Bad', '', 'single_choice', 1, ${labels}, ${correct})`,
            [quiz.itemId],
          ),
        );
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(message);
      }
      const left = await db.seed("select id from public.quiz_questions where item_id = $1", [
        quiz.itemId,
      ]);
      expect(left).toHaveLength(0);
    });
  });
});

describe("quiz completion cannot be forged", () => {
  it("blocks a student from completing a quiz item through progress, by insert or update", async () => {
    await withRollback(async (db) => {
      const { student, quiz } = await quizClassroom(db);
      const inserted = await db.asUser(student, (q) =>
        q.attempt(
          `insert into public.module_item_progress (item_id, student_id, completed_at)
           values ($1, $2, now()) returning id`,
          [quiz.itemId, student],
        ),
      );
      expect(inserted.ok && inserted.rows.length > 0).toBe(false);

      const started = await db.asUser(student, (q) =>
        q.run<{ id: string }>(
          "insert into public.module_item_progress (item_id, student_id) values ($1, $2) returning id",
          [quiz.itemId, student],
        ),
      );
      expect(started).toHaveLength(1);
      const completed = await db.asUser(student, (q) =>
        q.attempt(
          `update public.module_item_progress set completed_at = now()
           where item_id = $1 and student_id = $2 returning id`,
          [quiz.itemId, student],
        ),
      );
      expect(completed.ok && completed.rows.length > 0).toBe(false);
    });
  });

  it("blocks a student from un-completing a quiz they passed", async () => {
    await withRollback(async (db) => {
      const { student, quiz } = await quizClassroom(db, 1);
      await submit(db, student, quiz.itemId, answerPayload(quiz.questionIds, quiz.correctIds));
      const cleared = await db.asUser(student, (q) =>
        q.attempt(
          `update public.module_item_progress set completed_at = null
           where item_id = $1 and student_id = $2 returning id`,
          [quiz.itemId, student],
        ),
      );
      expect(cleared.ok && cleared.rows.length > 0).toBe(false);
    });
  });

  it("completes the quiz item, and the section, on a pass", async () => {
    await withRollback(async (db) => {
      const { student, sectionId, quiz } = await quizClassroom(db, 1);
      await submit(db, student, quiz.itemId, answerPayload(quiz.questionIds, quiz.correctIds));
      const [enrol] = await db.seed<{ completed_at: string | null }>(
        "select completed_at from public.section_enrollments where section_id = $1 and profile_id = $2",
        [sectionId, student],
      );
      expect(enrol.completed_at).not.toBeNull();
    });
  });

  it("cannot have an attempt inserted or edited by hand", async () => {
    await withRollback(async (db) => {
      const { student, quiz } = await quizClassroom(db, 1);
      const forged = await db.asUser(student, (q) =>
        q.attempt(
          `insert into public.quiz_attempts (item_id, student_id, score, max_score, passed, submitted_at)
           values ($1, $2, 1, 1, true, now()) returning id`,
          [quiz.itemId, student],
        ),
      );
      expect(forged.ok && forged.rows.length > 0).toBe(false);
      const id = await submit(db, student, quiz.itemId, answerPayload(quiz.questionIds, [quiz.wrongIds[0]]));
      const edited = await db.asUser(student, (q) =>
        q.attempt("update public.quiz_attempts set passed = true where id = $1 returning id", [id]),
      );
      expect(edited.ok && edited.rows.length > 0).toBe(false);
    });
  });
});

describe("review", () => {
  it("is readable by the student, their guardian and their teacher, not a classmate", async () => {
    await withRollback(async (db) => {
      const { student, teacher, schoolId, sectionId, quiz } = await quizClassroom(db, 1);
      const guardian = await db.createUser({ email: "guardian@s1.test" });
      await addMember(db, schoolId, guardian, "guardian");
      await linkGuardian(db, guardian, student);
      const mate = await db.createUser({ email: "mate@s1.test" });
      await addMember(db, schoolId, mate, "student");
      await db.seed(
        "insert into public.section_enrollments (section_id, profile_id, role) values ($1, $2, 'student')",
        [sectionId, mate],
      );
      const id = await submit(db, student, quiz.itemId, answerPayload(quiz.questionIds, quiz.correctIds));

      for (const who of [student, guardian, teacher]) {
        const rows = await db.asUser(who, (q) =>
          q.run("select question_id from public.quiz_attempt_review($1)", [id]),
        );
        expect(rows).toHaveLength(1);
      }
      const refused = await db.asUser(mate, (q) =>
        q.attempt("select * from public.quiz_attempt_review($1)", [id]),
      );
      expect(refused.ok).toBe(false);
      void completeItem;
    });
  });
});

async function moduleOf(db: TestDb, itemId: string): Promise<string> {
  const [row] = await db.seed<{ module_id: string }>(
    "select module_id from public.module_items where id = $1",
    [itemId],
  );
  return row.module_id;
}
