import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback } from "./harness";
import {
  answerPayload,
  completeLesson,
  enroll,
  linkParent,
  seedCourse,
  seedQuizLesson,
} from "./fixtures";

beforeAll(connect);
afterAll(disconnect);

describe("answer key confidentiality", () => {
  it("does not expose is_correct through the student-facing views", async () => {
    // The central guarantee: nothing a student can select reveals the key.
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      await seedQuizLesson(db, courseId);
      await enroll(db, courseId, student);

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
    // `authenticated` holds table privileges so that admins can author, so the
    // barrier here is RLS, not the grant: a student matches no policy and must
    // come away with nothing. Asserting on rows rather than on a permission
    // error is deliberate — an error would also pass if the key were readable
    // by some other route.
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      await seedQuizLesson(db, courseId);
      await enroll(db, courseId, student);

      for (const table of ["quiz_options", "quiz_questions"]) {
        const result = await db.asUser(student, (q) =>
          q.attempt(`select * from public.${table}`),
        );
        expect(result.ok && result.rows.length > 0).toBe(false);
      }
    });
  });

  it("keeps the key from a student who tries to write it", async () => {
    // The other half of the grant question: DML on the key tables must be
    // admin-only, or a student could simply mark their own choice correct.
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);
      await enroll(db, courseId, student);

      const flipped = await db.asUser(student, (q) =>
        q.attempt(
          `update public.quiz_options set is_correct = true
           where question_id = $1 returning id`,
          [quiz.questionIds[0]],
        ),
      );
      expect(flipped.ok && flipped.rows.length > 0).toBe(false);

      const inserted = await db.asUser(student, (q) =>
        q.attempt(
          `insert into public.quiz_questions (lesson_id, prompt, position)
           values ($1, 'mine', 99) returning id`,
          [quiz.lessonId],
        ),
      );
      expect(inserted.ok && inserted.rows.length > 0).toBe(false);
    });
  });

  it("lets an admin author questions and options through their own session", async () => {
    // Supabase runs admins as `authenticated` like everyone else, so revoking
    // that role's privileges outright would break authoring before any policy
    // ran. This is the positive counterpart that would catch it.
    await withRollback(async (db) => {
      const admin = await db.createUser({ email: "a@example.com" });
      await db.setRole(admin, "admin");
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);

      const existing = await db.asUser(admin, (q) =>
        q.run("select id, is_correct from public.quiz_options"),
      );
      expect(existing.length).toBeGreaterThan(0);

      const created = await db.asUser(admin, (q) =>
        q.run<{ id: string }>(
          `insert into public.quiz_questions (lesson_id, prompt, position)
           values ($1, 'Added by an admin', 99) returning id`,
          [quiz.lessonId],
        ),
      );
      expect(created).toHaveLength(1);

      const option = await db.asUser(admin, (q) =>
        q.run<{ id: string }>(
          `insert into public.quiz_options (question_id, label, is_correct, position)
           values ($1, 'Correct one', true, 1) returning id`,
          [created[0].id],
        ),
      );
      expect(option).toHaveLength(1);

      const archived = await db.asUser(admin, (q) =>
        q.run<{ id: string }>(
          `update public.quiz_questions set archived_at = now()
           where id = $1 returning id`,
          [created[0].id],
        ),
      );
      expect(archived).toHaveLength(1);
    });
  });

  it("lets an enrolled student read the prompts and choices", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, { questionCount: 2 });
      await enroll(db, courseId, student);

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

  it("hides prompts from a student who is not enrolled", async () => {
    await withRollback(async (db) => {
      const outsider = await db.createUser({ email: "o@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      await seedQuizLesson(db, courseId);

      const prompts = await db.asUser(outsider, (q) =>
        q.run("select id from public.quiz_question_prompts"),
      );
      expect(prompts).toEqual([]);
    });
  });

  it("hides prompts from anonymous callers", async () => {
    await withRollback(async (db) => {
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      await seedQuizLesson(db, courseId);
      const result = await db.asAnon((q) =>
        q.attempt("select id from public.quiz_question_prompts"),
      );
      expect(result.ok).toBe(false);
    });
  });
});

describe("authoring a question", () => {
  it("creates the question and its options in one transaction", async () => {
    await withRollback(async (db) => {
      const admin = await db.createUser({ email: "a@example.com" });
      await db.setRole(admin, "admin");
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, { questionCount: 0 });

      const [created] = await db.asUser(admin, (q) =>
        q.run<{ create_quiz_question: string }>(
          `select public.create_quiz_question(
             $1, 'Which one?', 'Because.', 'single_choice', 2,
             array['A', 'B'], array[false, true]
           )`,
          [quiz.lessonId],
        ),
      );

      const options = await db.seed<{ label: string; is_correct: boolean }>(
        "select label, is_correct from public.quiz_options where question_id = $1 order by position",
        [created.create_quiz_question],
      );
      expect(options).toEqual([
        { label: "A", is_correct: false },
        { label: "B", is_correct: true },
      ]);
    });
  });

  it("leaves nothing behind when the options are invalid", async () => {
    // The reason this is one function: a question committed without its
    // options would be shown to students with nothing to choose.
    await withRollback(async (db) => {
      const admin = await db.createUser({ email: "a@example.com" });
      await db.setRole(admin, "admin");
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, { questionCount: 0 });

      for (const [labels, correct, message] of [
        ["array['A']", "array[true]", /at least two options/i],
        ["array['A', 'B']", "array[false, false]", /at least one correct/i],
        ["array['A', 'B']", "array[true, true]", /single-choice/i],
      ] as const) {
        const result = await db.asUser(admin, (q) =>
          q.attempt(
            `select public.create_quiz_question(
               $1, 'Bad', '', 'single_choice', 1, ${labels}, ${correct}
             )`,
            [quiz.lessonId],
          ),
        );
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(message);
      }

      const left = await db.seed(
        "select id from public.quiz_questions where lesson_id = $1",
        [quiz.lessonId],
      );
      expect(left).toHaveLength(0);
    });
  });

  it("refuses a student", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, { questionCount: 0 });
      await enroll(db, courseId, student);

      const result = await db.asUser(student, (q) =>
        q.attempt(
          `select public.create_quiz_question(
             $1, 'Mine', '', 'single_choice', 1, array['A', 'B'], array[true, false]
           )`,
          [quiz.lessonId],
        ),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });
  });

  it("refuses to grade a lesson that is not a quiz", async () => {
    // Grading is the only path that may complete a quiz lesson, and being
    // definer it bypasses the policies guarding lesson_progress. So it has to
    // refuse a lesson whose completion is governed by the ordinary rules,
    // however that lesson came to have questions attached.
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db, { lessonCount: 1 });
      await enroll(db, courseId, student);

      const [question] = await db.seed<{ id: string }>(
        `insert into public.quiz_questions (lesson_id, prompt, position)
         values ($1, 'Attached to a video lesson', 1) returning id`,
        [lessonIds[0]],
      );
      await db.seed(
        `insert into public.quiz_options (question_id, label, is_correct, position)
         values ($1, 'Right', true, 1)`,
        [question.id],
      );

      const result = await db.asUser(student, (q) =>
        q.attempt("select public.submit_quiz_attempt($1, $2::jsonb)", [
          lessonIds[0],
          answerPayload([question.id], [[]]),
        ]),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not a quiz lesson/i);
    });
  });

  it("does not let a question without options block a pass", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, { questionCount: 1 });
      await enroll(db, courseId, student);

      await db.seed(
        `insert into public.quiz_questions (lesson_id, prompt, position)
         values ($1, 'Half-authored', 50)`,
        [quiz.lessonId],
      );

      const [row] = await db.asUser(student, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [quiz.lessonId, answerPayload(quiz.questionIds, quiz.correctIds)],
        ),
      );

      const [attempt] = await db.seed<{ max_score: number; passed: boolean }>(
        "select max_score, passed from public.quiz_attempts where id = $1",
        [row.submit_quiz_attempt],
      );
      expect(attempt).toMatchObject({ max_score: 1, passed: true });
    });
  });
});

describe("quiz completion cannot be forged", () => {
  it("blocks a student from completing a quiz lesson through lesson_progress", async () => {
    // The generic progress path gates on can_access_lesson() alone, so without
    // an explicit rule a student who merely reached the quiz could stamp it
    // complete and skip it entirely.
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);
      await enroll(db, courseId, student);

      const inserted = await db.asUser(student, (q) =>
        q.attempt(
          `insert into public.lesson_progress (lesson_id, student_id, completed_at)
           values ($1, $2, now()) returning id`,
          [quiz.lessonId, student],
        ),
      );
      expect(inserted.ok && inserted.rows.length > 0).toBe(false);
    });
  });

  it("blocks completing a quiz lesson by updating progress after starting it", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);
      await enroll(db, courseId, student);

      // Opening the quiz is allowed and must stay allowed.
      const started = await db.asUser(student, (q) =>
        q.run<{ id: string }>(
          `insert into public.lesson_progress (lesson_id, student_id)
           values ($1, $2) returning id`,
          [quiz.lessonId, student],
        ),
      );
      expect(started).toHaveLength(1);

      const completed = await db.asUser(student, (q) =>
        q.attempt(
          `update public.lesson_progress set completed_at = now()
           where lesson_id = $1 and student_id = $2 returning id`,
          [quiz.lessonId, student],
        ),
      );
      expect(completed.ok && completed.rows.length > 0).toBe(false);
    });
  });

  it("still lets a student complete a non-quiz lesson", async () => {
    // The positive counterpart: the new rule must bite only on quizzes.
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db, { lessonCount: 1 });
      await enroll(db, courseId, student);

      const done = await db.asUser(student, (q) =>
        q.run<{ id: string }>(
          `insert into public.lesson_progress (lesson_id, student_id, completed_at)
           values ($1, $2, now()) returning id`,
          [lessonIds[0], student],
        ),
      );
      expect(done).toHaveLength(1);
    });
  });

  it("refuses an attempt from a linked parent", async () => {
    // A parent can read a child's lesson, but can_access_lesson() requires an
    // enrolment, so grading must refuse them — otherwise a parent could submit
    // an empty attempt and read the key back out of the review.
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const parent = await db.createUser({ email: "p@example.com", role: "parent" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);
      await enroll(db, courseId, student);
      await db.seed(
        "insert into public.parent_student_links (parent_id, student_id) values ($1, $2)",
        [parent, student],
      );

      const result = await db.asUser(parent, (q) =>
        q.attempt("select public.submit_quiz_attempt($1, $2::jsonb)", [
          quiz.lessonId,
          answerPayload(quiz.questionIds, quiz.correctIds),
        ]),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });
  });
});

describe("archived questions", () => {
  it("drops an archived question from grading and from the student's view", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, { questionCount: 2 });
      await enroll(db, courseId, student);

      await db.seed("update public.quiz_questions set archived_at = now() where id = $1", [
        quiz.questionIds[1],
      ]);

      const prompts = await db.asUser(student, (q) =>
        q.run("select id from public.quiz_question_prompts"),
      );
      expect(prompts).toHaveLength(1);

      // Answering only the surviving question is now a full score.
      const [row] = await db.asUser(student, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [
            quiz.lessonId,
            answerPayload([quiz.questionIds[0]], [quiz.correctIds[0]]),
          ],
        ),
      );

      const [attempt] = await db.seed<{ max_score: number; passed: boolean }>(
        "select max_score, passed from public.quiz_attempts where id = $1",
        [row.submit_quiz_attempt],
      );
      expect(attempt).toMatchObject({ max_score: 1, passed: true });
    });
  });

  it("still reads out the answer labels of an archived question", async () => {
    // The review carries labels precisely because the student-facing views no
    // longer expose an archived question's options — resolving ids against the
    // live quiz would leave a retired answer rendering blank.
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, { questionCount: 1 });
      await enroll(db, courseId, student);

      const [row] = await db.asUser(student, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [quiz.lessonId, answerPayload(quiz.questionIds, quiz.correctIds)],
        ),
      );

      await db.seed("update public.quiz_questions set archived_at = now() where id = $1", [
        quiz.questionIds[0],
      ]);

      const review = await db.asUser(student, (q) =>
        q.run<{ selected_labels: string[]; correct_labels: string[] }>(
          "select selected_labels, correct_labels from public.quiz_attempt_review($1)",
          [row.submit_quiz_attempt],
        ),
      );
      expect(review[0].selected_labels).toEqual(["Option 1"]);
      expect(review[0].correct_labels).toEqual(["Option 1"]);
    });
  });

  it("keeps a past attempt's answers when a question is archived", async () => {
    // The reason archiving exists: deleting would cascade quiz_answers away
    // and leave the stored score describing questions that no longer exist.
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, { questionCount: 2 });
      await enroll(db, courseId, student);

      const [row] = await db.asUser(student, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [quiz.lessonId, answerPayload(quiz.questionIds, quiz.correctIds)],
        ),
      );

      await db.seed("update public.quiz_questions set archived_at = now() where id = $1", [
        quiz.questionIds[1],
      ]);

      const review = await db.asUser(student, (q) =>
        q.run("select question_id from public.quiz_attempt_review($1)", [
          row.submit_quiz_attempt,
        ]),
      );
      expect(review).toHaveLength(2);
    });
  });
});

describe("grading", () => {
  it("records the pass mark it applied, so a later change cannot rewrite it", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, {
        questionCount: 2,
        passMark: 50,
      });
      await enroll(db, courseId, student);

      const [row] = await db.asUser(student, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [
            quiz.lessonId,
            answerPayload(quiz.questionIds, [quiz.correctIds[0], quiz.wrongIds[1]]),
          ],
        ),
      );

      // 1 of 2 = 50%, which cleared the bar at submission time.
      await db.seed("update public.lessons set pass_mark = 100 where id = $1", [
        quiz.lessonId,
      ]);

      const [attempt] = await db.seed<{ pass_mark: number; passed: boolean }>(
        "select pass_mark, passed from public.quiz_attempts where id = $1",
        [row.submit_quiz_attempt],
      );
      expect(attempt).toMatchObject({ pass_mark: 50, passed: true });
    });
  });

  it("scores a fully correct submission and passes", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, { questionCount: 2 });
      await enroll(db, courseId, student);

      const [row] = await db.asUser(student, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [quiz.lessonId, answerPayload(quiz.questionIds, quiz.correctIds)],
        ),
      );

      const [attempt] = await db.seed<{
        score: number;
        max_score: number;
        passed: boolean;
      }>("select score, max_score, passed from public.quiz_attempts where id = $1", [
        row.submit_quiz_attempt,
      ]);
      expect(attempt).toMatchObject({ score: 2, max_score: 2, passed: true });
    });
  });

  it("scores a fully wrong submission and fails", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, { questionCount: 2 });
      await enroll(db, courseId, student);

      const [row] = await db.asUser(student, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [
            quiz.lessonId,
            answerPayload(
              quiz.questionIds,
              quiz.wrongIds.map((w) => [w[0]]),
            ),
          ],
        ),
      );

      const [attempt] = await db.seed<{ score: number; passed: boolean }>(
        "select score, passed from public.quiz_attempts where id = $1",
        [row.submit_quiz_attempt],
      );
      expect(attempt).toMatchObject({ score: 0, passed: false });
    });
  });

  it("treats an unanswered question as wrong", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, { questionCount: 2 });
      await enroll(db, courseId, student);

      const [row] = await db.asUser(student, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [quiz.lessonId, answerPayload(quiz.questionIds, [quiz.correctIds[0], []])],
        ),
      );
      const [attempt] = await db.seed<{ score: number; max_score: number }>(
        "select score, max_score from public.quiz_attempts where id = $1",
        [row.submit_quiz_attempt],
      );
      expect(attempt).toMatchObject({ score: 1, max_score: 2 });
    });
  });

  it("requires an exact match on a multi-choice question", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, { questionCount: 1 });
      await enroll(db, courseId, student);

      // Promote a distractor to correct: the key is now two options.
      await db.seed(
        "update public.quiz_options set is_correct = true where id = $1",
        [quiz.wrongIds[0][0]],
      );
      await db.seed(
        "update public.quiz_questions set kind = 'multi_choice' where id = $1",
        [quiz.questionIds[0]],
      );

      // Only one of the two correct options — partial answers score nothing.
      const [partial] = await db.asUser(student, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [quiz.lessonId, answerPayload(quiz.questionIds, [quiz.correctIds[0]])],
        ),
      );
      const [partialAttempt] = await db.seed<{ score: number }>(
        "select score from public.quiz_attempts where id = $1",
        [partial.submit_quiz_attempt],
      );
      expect(partialAttempt.score).toBe(0);

      const [exact] = await db.asUser(student, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [
            quiz.lessonId,
            answerPayload(quiz.questionIds, [
              [...quiz.correctIds[0], quiz.wrongIds[0][0]],
            ]),
          ],
        ),
      );
      const [exactAttempt] = await db.seed<{ score: number }>(
        "select score from public.quiz_attempts where id = $1",
        [exact.submit_quiz_attempt],
      );
      expect(exactAttempt.score).toBe(1);
    });
  });

  it("ignores option ids belonging to another question", async () => {
    // A crafted payload must not be able to smuggle in foreign option ids.
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, { questionCount: 2 });
      await enroll(db, courseId, student);

      const [row] = await db.asUser(student, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [
            quiz.lessonId,
            answerPayload(quiz.questionIds, [
              [...quiz.correctIds[0], ...quiz.correctIds[1]],
              quiz.correctIds[1],
            ]),
          ],
        ),
      );
      // Question 1 still grades as correct: the foreign id is discarded rather
      // than treated as an extra selection that would break the exact match.
      const [attempt] = await db.seed<{ score: number }>(
        "select score from public.quiz_attempts where id = $1",
        [row.submit_quiz_attempt],
      );
      expect(attempt.score).toBe(2);
    });
  });

  it("honours the lesson's pass mark", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, {
        questionCount: 2,
        passMark: 100,
      });
      await enroll(db, courseId, student);

      const [row] = await db.asUser(student, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [quiz.lessonId, answerPayload(quiz.questionIds, [quiz.correctIds[0], []])],
        ),
      );
      const [attempt] = await db.seed<{ passed: boolean }>(
        "select passed from public.quiz_attempts where id = $1",
        [row.submit_quiz_attempt],
      );
      // 50% against a 100% threshold.
      expect(attempt.passed).toBe(false);
    });
  });
});

describe("attempt access control", () => {
  it("refuses submission from a student who is not enrolled", async () => {
    await withRollback(async (db) => {
      const outsider = await db.createUser({ email: "o@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);

      const result = await db.asUser(outsider, (q) =>
        q.attempt("select public.submit_quiz_attempt($1, $2::jsonb)", [
          quiz.lessonId,
          answerPayload(quiz.questionIds, quiz.correctIds),
        ]),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });
  });

  it("refuses submission from an anonymous caller", async () => {
    await withRollback(async (db) => {
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);
      const result = await db.asAnon((q) =>
        q.attempt("select public.submit_quiz_attempt($1, $2::jsonb)", [
          quiz.lessonId,
          answerPayload(quiz.questionIds, quiz.correctIds),
        ]),
      );
      expect(result.ok).toBe(false);
    });
  });

  it("blocks a student from writing an attempt row directly", async () => {
    // Scores are only ever produced by the grading function.
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);
      await enroll(db, courseId, student);

      const result = await db.asUser(student, (q) =>
        q.attempt(
          `insert into public.quiz_attempts
             (lesson_id, student_id, submitted_at, score, max_score, passed)
           values ($1, $2, now(), 99, 99, true) returning id`,
          [quiz.lessonId, student],
        ),
      );
      expect(result.ok).toBe(false);
    });
  });

  it("blocks a student from editing a graded attempt", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);
      await enroll(db, courseId, student);

      const [row] = await db.asUser(student, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [quiz.lessonId, answerPayload(quiz.questionIds, quiz.wrongIds.map((w) => [w[0]]))],
        ),
      );

      const result = await db.asUser(student, (q) =>
        q.attempt(
          "update public.quiz_attempts set passed = true, score = 99 where id = $1 returning id",
          [row.submit_quiz_attempt],
        ),
      );
      expect(result.ok && result.rows.length > 0).toBe(false);
    });
  });

  it("lets a student read only their own attempts", async () => {
    await withRollback(async (db) => {
      const mine = await db.createUser({ email: "m@example.com", role: "student" });
      const theirs = await db.createUser({ email: "t@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);
      await enroll(db, courseId, mine);
      await enroll(db, courseId, theirs);

      for (const student of [mine, theirs]) {
        await db.asUser(student, (q) =>
          q.run("select public.submit_quiz_attempt($1, $2::jsonb)", [
            quiz.lessonId,
            answerPayload(quiz.questionIds, quiz.correctIds),
          ]),
        );
      }

      const rows = await db.asUser(mine, (q) =>
        q.run<{ student_id: string }>("select student_id from public.quiz_attempts"),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].student_id).toBe(mine);
    });
  });

  it("lets a linked parent read their child's attempts", async () => {
    await withRollback(async (db) => {
      const parent = await db.createUser({ email: "p@example.com", role: "parent" });
      const child = await db.createUser({ email: "c@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);
      await linkParent(db, parent, child);
      await enroll(db, courseId, child);

      await db.asUser(child, (q) =>
        q.run("select public.submit_quiz_attempt($1, $2::jsonb)", [
          quiz.lessonId,
          answerPayload(quiz.questionIds, quiz.correctIds),
        ]),
      );

      const rows = await db.asUser(parent, (q) =>
        q.run("select id from public.quiz_attempts"),
      );
      expect(rows).toHaveLength(1);
    });
  });
});

describe("attempt review", () => {
  it("returns the key and explanation once the attempt is graded", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId, { questionCount: 2 });
      await enroll(db, courseId, student);

      const [row] = await db.asUser(student, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [quiz.lessonId, answerPayload(quiz.questionIds, [quiz.correctIds[0], []])],
        ),
      );

      const review = await db.asUser(student, (q) =>
        q.run<{
          is_correct: boolean;
          explanation: string;
          correct_option_ids: string[];
        }>("select * from public.quiz_attempt_review($1)", [row.submit_quiz_attempt]),
      );
      expect(review).toHaveLength(2);
      expect(review[0].is_correct).toBe(true);
      expect(review[1].is_correct).toBe(false);
      expect(review[0].explanation).toBe("Because.");
      expect(review[1].correct_option_ids).toEqual(quiz.correctIds[1]);
    });
  });

  it("refuses to review somebody else's attempt", async () => {
    await withRollback(async (db) => {
      const owner = await db.createUser({ email: "o@example.com", role: "student" });
      const nosy = await db.createUser({ email: "n@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);
      await enroll(db, courseId, owner);
      await enroll(db, courseId, nosy);

      const [row] = await db.asUser(owner, (q) =>
        q.run<{ submit_quiz_attempt: string }>(
          "select public.submit_quiz_attempt($1, $2::jsonb)",
          [quiz.lessonId, answerPayload(quiz.questionIds, quiz.correctIds)],
        ),
      );

      const result = await db.asUser(nosy, (q) =>
        q.attempt("select * from public.quiz_attempt_review($1)", [
          row.submit_quiz_attempt,
        ]),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });
  });
});

describe("lesson completion", () => {
  it("completes the lesson on a pass", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);
      await enroll(db, courseId, student);

      await db.asUser(student, (q) =>
        q.run("select public.submit_quiz_attempt($1, $2::jsonb)", [
          quiz.lessonId,
          answerPayload(quiz.questionIds, quiz.correctIds),
        ]),
      );

      const [progress] = await db.seed<{ completed_at: string | null }>(
        "select completed_at from public.lesson_progress where lesson_id = $1 and student_id = $2",
        [quiz.lessonId, student],
      );
      expect(progress?.completed_at).not.toBeNull();
    });
  });

  it("leaves the lesson incomplete on a fail", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);
      await enroll(db, courseId, student);

      await db.asUser(student, (q) =>
        q.run("select public.submit_quiz_attempt($1, $2::jsonb)", [
          quiz.lessonId,
          answerPayload(quiz.questionIds, quiz.wrongIds.map((w) => [w[0]])),
        ]),
      );

      const rows = await db.seed<{ completed_at: string | null }>(
        "select completed_at from public.lesson_progress where lesson_id = $1 and student_id = $2",
        [quiz.lessonId, student],
      );
      expect(rows[0]?.completed_at ?? null).toBeNull();
    });
  });

  it("lets a retake pass after an earlier failure", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 0 });
      const quiz = await seedQuizLesson(db, courseId);
      await enroll(db, courseId, student);

      await db.asUser(student, (q) =>
        q.run("select public.submit_quiz_attempt($1, $2::jsonb)", [
          quiz.lessonId,
          answerPayload(quiz.questionIds, quiz.wrongIds.map((w) => [w[0]])),
        ]),
      );
      await db.asUser(student, (q) =>
        q.run("select public.submit_quiz_attempt($1, $2::jsonb)", [
          quiz.lessonId,
          answerPayload(quiz.questionIds, quiz.correctIds),
        ]),
      );

      const attempts = await db.seed<{ passed: boolean }>(
        "select passed from public.quiz_attempts where student_id = $1 order by started_at",
        [student],
      );
      expect(attempts.map((a) => a.passed)).toEqual([false, true]);

      const [progress] = await db.seed<{ completed_at: string | null }>(
        "select completed_at from public.lesson_progress where lesson_id = $1 and student_id = $2",
        [quiz.lessonId, student],
      );
      expect(progress?.completed_at).not.toBeNull();
    });
  });

  it("unlocks the next lesson once the quiz is passed", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db, { lessonCount: 1 });
      const quiz = await seedQuizLesson(db, courseId, { position: 2 });
      const [after] = await db.seed<{ id: string }>(
        `insert into public.lessons (course_id, title, content, position)
         values ($1, 'After the quiz', 'body', 3) returning id`,
        [courseId],
      );
      await enroll(db, courseId, student);
      await completeLesson(db, lessonIds[0], student);

      // Sequential unlock: the lesson after the quiz is out of reach until the
      // quiz itself is passed.
      const before = await db.asUser(student, (q) =>
        q.run<{ can: boolean }>("select public.can_access_lesson($1) as can", [after.id]),
      );
      expect(before[0].can).toBe(false);

      await db.asUser(student, (q) =>
        q.run("select public.submit_quiz_attempt($1, $2::jsonb)", [
          quiz.lessonId,
          answerPayload(quiz.questionIds, quiz.correctIds),
        ]),
      );

      const now = await db.asUser(student, (q) =>
        q.run<{ can: boolean }>("select public.can_access_lesson($1) as can", [after.id]),
      );
      expect(now[0].can).toBe(true);
    });
  });
});
