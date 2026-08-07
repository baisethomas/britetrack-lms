export type UserRole = "admin" | "student" | "parent";
export type CourseStatus = "draft" | "published" | "archived";
export type LessonContentType = "video" | "article" | "quiz" | "live_session";
export type NotificationType =
  | "enrollment"
  | "lesson_unlocked"
  | "live_session"
  | "announcement"
  | "progress";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  avatar_url: string | null;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  cover_url: string | null;
  category: string | null;
  status: CourseStatus;
  sequential_unlock: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  course_id: string;
  title: string;
  summary: string;
  content_type: LessonContentType;
  content: string;
  video_url: string | null;
  duration_minutes: number;
  position: number;
  created_at: string;
  updated_at: string;
}

/** Row of the lesson_catalog view — browsing metadata without lesson content. */
export type LessonSummary = Omit<
  Lesson,
  "content" | "video_url" | "created_at" | "updated_at"
>;

export interface Enrollment {
  id: string;
  course_id: string;
  student_id: string;
  enrolled_at: string;
  completed_at: string | null;
}

export interface LessonProgress {
  id: string;
  lesson_id: string;
  student_id: string;
  started_at: string;
  completed_at: string | null;
}

export interface LiveSession {
  id: string;
  course_id: string;
  title: string;
  starts_at: string;
  duration_minutes: number;
  zoom_meeting_id: string | null;
  join_url: string | null;
  recording_url: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
}
