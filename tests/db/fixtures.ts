import type { TestDb } from "./harness";

/**
 * Fixtures seed as the schema owner (bypassing RLS) except where exercising
 * a public RPC is the point — founding a school and creating a section go
 * through the functions a real client would call.
 */

export interface SeededSchool {
  orgId: string;
  schoolId: string;
  termId: string;
}

/** Found a school as `adminId` through create_school(), then add a term. */
export async function foundSchool(
  db: TestDb,
  adminId: string,
  name = "Test School",
): Promise<SeededSchool> {
  const [row] = await db.asUser(adminId, (q) =>
    q.run<{ create_school: string }>("select public.create_school($1)", [name]),
  );
  const schoolId = row.create_school;
  const [school] = await db.seed<{ organization_id: string }>(
    "select organization_id from public.schools where id = $1",
    [schoolId],
  );
  const [term] = await db.seed<{ id: string }>(
    `insert into public.terms (school_id, name, starts_on, ends_on)
     values ($1, 'Fall', current_date - 30, current_date + 120) returning id`,
    [schoolId],
  );
  return { orgId: school.organization_id, schoolId, termId: term.id };
}

export type SchoolRole = "school_admin" | "teacher" | "student" | "guardian" | "staff";

/** Give a profile a role at a school, bypassing RLS (the invitation path's effect). */
export async function addMember(
  db: TestDb,
  schoolId: string,
  profileId: string,
  role: SchoolRole,
  options: { gradeLevel?: number } = {},
): Promise<void> {
  await db.seed(
    `insert into public.memberships (school_id, profile_id, role) values ($1, $2, $3)
     on conflict (school_id, profile_id, role) do update set status = 'active'`,
    [schoolId, profileId, role],
  );
  if (role === "student") {
    await db.seed(
      `insert into public.students (profile_id, school_id, grade_level) values ($1, $2, $3)
       on conflict (profile_id) do update set school_id = excluded.school_id`,
      [profileId, schoolId, options.gradeLevel ?? 5],
    );
  }
}

export async function seedCourse(
  db: TestDb,
  schoolId: string,
  options: { status?: "draft" | "published" | "archived"; title?: string; createdBy?: string } = {},
): Promise<string> {
  const { status = "published", title = "Algebra I", createdBy = null } = options;
  const [course] = await db.seed<{ id: string }>(
    `insert into public.courses (school_id, title, description, status, created_by)
     values ($1, $2, 'desc', $3, $4) returning id`,
    [schoolId, title, status, createdBy],
  );
  return course.id;
}

/** Create a section directly; enroll `teacherId` as its teacher when given. */
export async function seedSection(
  db: TestDb,
  options: {
    courseId: string;
    termId: string;
    teacherId?: string;
    name?: string;
    status?: "active" | "archived";
  },
): Promise<string> {
  const [section] = await db.seed<{ id: string }>(
    `insert into public.sections (school_id, course_id, term_id, name, status)
     values ((select school_id from public.courses where id = $1), $1, $2, $3, $4)
     returning id`,
    [options.courseId, options.termId, options.name ?? "Period 1", options.status ?? "active"],
  );
  if (options.teacherId) {
    await db.seed(
      `insert into public.section_enrollments (section_id, profile_id, role)
       values ($1, $2, 'teacher')`,
      [section.id, options.teacherId],
    );
  }
  return section.id;
}

export async function enrollStudent(
  db: TestDb,
  sectionId: string,
  studentId: string,
): Promise<void> {
  await db.seed(
    `insert into public.section_enrollments (section_id, profile_id, role)
     values ($1, $2, 'student')`,
    [sectionId, studentId],
  );
}

export async function seedModule(
  db: TestDb,
  sectionId: string,
  options: {
    position?: number;
    title?: string;
    unlock?: "free" | "sequential";
    published?: boolean;
    prerequisiteId?: string | null;
  } = {},
): Promise<string> {
  const [row] = await db.seed<{ id: string }>(
    `insert into public.modules
       (section_id, title, position, unlock_mode, published, prerequisite_module_id)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      sectionId,
      options.title ?? "Unit 1",
      options.position ?? 1,
      options.unlock ?? "sequential",
      options.published ?? true,
      options.prerequisiteId ?? null,
    ],
  );
  return row.id;
}

export async function seedItem(
  db: TestDb,
  moduleId: string,
  options: {
    position: number;
    kind?: "page" | "video" | "quiz" | "live_session" | "link";
    title?: string;
    required?: boolean;
    published?: boolean;
    passMark?: number;
  },
): Promise<string> {
  const [row] = await db.seed<{ id: string }>(
    `insert into public.module_items
       (module_id, position, kind, title, summary, content, video_url, duration_minutes,
        required, published, pass_mark)
     values ($1, $2, $3, $4, 'summary', $5, $6, 10, $7, $8, $9) returning id`,
    [
      moduleId,
      options.position,
      options.kind ?? "page",
      options.title ?? `Item ${options.position}`,
      `secret body ${options.position}`,
      `https://video.example/${options.position}`,
      options.required ?? true,
      options.published ?? true,
      options.passMark ?? 70,
    ],
  );
  return row.id;
}

/** Record a completed item directly, bypassing RLS. */
export async function completeItem(
  db: TestDb,
  itemId: string,
  studentId: string,
): Promise<void> {
  await db.seed(
    `insert into public.module_item_progress (item_id, student_id, completed_at)
     values ($1, $2, now())
     on conflict (item_id, student_id) do update set completed_at = now()`,
    [itemId, studentId],
  );
}

export async function linkGuardian(
  db: TestDb,
  guardianId: string,
  studentId: string,
): Promise<void> {
  await db.seed(
    "insert into public.guardian_links (guardian_id, student_id) values ($1, $2)",
    [guardianId, studentId],
  );
}

/** A section enrollment's derived completion stamp, bypassing RLS. */
export async function completedAt(
  db: TestDb,
  sectionId: string,
  studentId: string,
): Promise<string | null> {
  const [row] = await db.seed<{ completed_at: string | null }>(
    `select completed_at from public.section_enrollments
     where section_id = $1 and profile_id = $2`,
    [sectionId, studentId],
  );
  return row?.completed_at ?? null;
}

export interface Classroom extends SeededSchool {
  admin: string;
  teacher: string;
  student: string;
  courseId: string;
  sectionId: string;
  moduleId: string;
  itemIds: string[];
}

/**
 * One school with an admin, a teacher, an enrolled student, and a published
 * module of `itemCount` required pages. `tag` keeps emails unique when a test
 * needs two of these.
 */
export async function seedClassroom(
  db: TestDb,
  options: { itemCount?: number; unlock?: "free" | "sequential"; tag?: string } = {},
): Promise<Classroom> {
  const { itemCount = 3, unlock = "sequential", tag = "s1" } = options;
  const admin = await db.createUser({ email: `admin@${tag}.test` });
  const teacher = await db.createUser({ email: `teacher@${tag}.test` });
  const student = await db.createUser({ email: `student@${tag}.test` });

  const school = await foundSchool(db, admin, `School ${tag}`);
  await addMember(db, school.schoolId, teacher, "teacher");
  await addMember(db, school.schoolId, student, "student");

  const courseId = await seedCourse(db, school.schoolId);
  const sectionId = await seedSection(db, {
    courseId,
    termId: school.termId,
    teacherId: teacher,
  });
  await enrollStudent(db, sectionId, student);

  const moduleId = await seedModule(db, sectionId, { unlock });
  const itemIds: string[] = [];
  for (let position = 1; position <= itemCount; position += 1) {
    itemIds.push(await seedItem(db, moduleId, { position }));
  }

  return { ...school, admin, teacher, student, courseId, sectionId, moduleId, itemIds };
}

export interface SeededQuiz {
  itemId: string;
  questionIds: string[];
  /** Correct option ids, parallel to questionIds. */
  correctIds: string[][];
  /** Incorrect option ids, parallel to questionIds. */
  wrongIds: string[][];
}

/**
 * Add a quiz item to a module: `questionCount` single-choice questions, each
 * with one correct option and two distractors.
 */
export async function seedQuizItem(
  db: TestDb,
  moduleId: string,
  options: { questionCount?: number; passMark?: number; position?: number } = {},
): Promise<SeededQuiz> {
  const { questionCount = 2, passMark = 70, position = 99 } = options;
  const itemId = await seedItem(db, moduleId, {
    position,
    kind: "quiz",
    title: "Quiz",
    passMark,
  });

  const questionIds: string[] = [];
  const correctIds: string[][] = [];
  const wrongIds: string[][] = [];

  for (let q = 1; q <= questionCount; q += 1) {
    const [question] = await db.seed<{ id: string }>(
      `insert into public.quiz_questions (item_id, prompt, explanation, position)
       values ($1, $2, 'Because.', $3) returning id`,
      [itemId, `Question ${q}`, q],
    );
    questionIds.push(question.id);

    const correct: string[] = [];
    const wrong: string[] = [];
    for (let o = 1; o <= 3; o += 1) {
      const isCorrect = o === 1;
      const [option] = await db.seed<{ id: string }>(
        `insert into public.quiz_options (question_id, label, is_correct, position)
         values ($1, $2, $3, $4) returning id`,
        [question.id, `Option ${o}`, isCorrect, o],
      );
      (isCorrect ? correct : wrong).push(option.id);
    }
    correctIds.push(correct);
    wrongIds.push(wrong);
  }

  return { itemId, questionIds, correctIds, wrongIds };
}

/** Shape submit_quiz_attempt() expects. */
export function answerPayload(questionIds: string[], chosen: string[][]): string {
  return JSON.stringify(
    questionIds.map((id, i) => ({ question_id: id, option_ids: chosen[i] ?? [] })),
  );
}
