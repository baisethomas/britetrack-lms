import type { TestDb } from "./harness";

export interface SeededCourse {
  courseId: string;
  lessonIds: string[];
}

/** Create a course with `lessonCount` lessons at positions 1..n. */
export async function seedCourse(
  db: TestDb,
  options: {
    status?: "draft" | "published" | "archived";
    sequentialUnlock?: boolean;
    lessonCount?: number;
    title?: string;
  } = {},
): Promise<SeededCourse> {
  const {
    status = "published",
    sequentialUnlock = true,
    lessonCount = 3,
    title = "Test course",
  } = options;

  const [course] = await db.seed<{ id: string }>(
    `insert into public.courses (title, description, status, sequential_unlock)
     values ($1, 'desc', $2, $3) returning id`,
    [title, status, sequentialUnlock],
  );

  const lessonIds: string[] = [];
  for (let position = 1; position <= lessonCount; position += 1) {
    const [lesson] = await db.seed<{ id: string }>(
      `insert into public.lessons
         (course_id, title, summary, content, video_url, position, duration_minutes)
       values ($1, $2, 'summary', $3, $4, $5, 10) returning id`,
      [
        course.id,
        `Lesson ${position}`,
        `secret body ${position}`,
        `https://video.example/${position}`,
        position,
      ],
    );
    lessonIds.push(lesson.id);
  }

  return { courseId: course.id, lessonIds };
}

/** Enroll a student, bypassing RLS (the admin/bulk path). */
export async function enroll(
  db: TestDb,
  courseId: string,
  studentId: string,
): Promise<void> {
  await db.seed(
    "insert into public.enrollments (course_id, student_id) values ($1, $2)",
    [courseId, studentId],
  );
}

/** Record a completed lesson directly, bypassing RLS. */
export async function completeLesson(
  db: TestDb,
  lessonId: string,
  studentId: string,
): Promise<void> {
  await db.seed(
    `insert into public.lesson_progress (lesson_id, student_id, completed_at)
     values ($1, $2, now())
     on conflict (lesson_id, student_id) do update set completed_at = now()`,
    [lessonId, studentId],
  );
}

/** Link a parent to a student, bypassing RLS. */
export async function linkParent(
  db: TestDb,
  parentId: string,
  studentId: string,
): Promise<void> {
  await db.seed(
    "insert into public.parent_student_links (parent_id, student_id) values ($1, $2)",
    [parentId, studentId],
  );
}

/** Read an enrollment's completion timestamp, bypassing RLS. */
export async function completedAt(
  db: TestDb,
  courseId: string,
  studentId: string,
): Promise<string | null> {
  const [row] = await db.seed<{ completed_at: string | null }>(
    "select completed_at from public.enrollments where course_id = $1 and student_id = $2",
    [courseId, studentId],
  );
  return row?.completed_at ?? null;
}
