// Row shapes for the baseline schema. Roles are scoped to a school; nobody
// holds a global role.

export type OrganizationKind = "independent" | "district" | "network";
export type SchoolRole = "school_admin" | "teacher" | "student" | "guardian" | "staff";
export type CourseStatus = "draft" | "published" | "archived";
export type SectionStatus = "active" | "archived";
export type EnrollmentRole = "teacher" | "co_teacher" | "aide" | "student";
export type EnrollmentStatus = "active" | "dropped";
export type ModuleUnlock = "free" | "sequential";
export type ItemKind = "page" | "video" | "quiz" | "live_session" | "link";
export type LiveProvider = "zoom" | "google_meet" | "external";
export type NotificationType =
  | "enrollment"
  | "item_unlocked"
  | "live_session"
  | "announcement"
  | "progress";

export interface Organization {
  id: string;
  name: string;
  kind: OrganizationKind;
  created_at: string;
}

export interface School {
  id: string;
  organization_id: string;
  name: string;
  timezone: string;
  grade_min: number;
  grade_max: number;
  created_at: string;
}

export interface Term {
  id: string;
  school_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
}

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  school_id: string;
  profile_id: string;
  role: SchoolRole;
  status: "active" | "inactive";
}

export interface Student {
  profile_id: string;
  school_id: string;
  grade_level: number;
  student_number: string | null;
  date_of_birth: string | null;
}

export interface Invitation {
  id: string;
  school_id: string;
  email: string;
  role: SchoolRole;
  grade_level: number | null;
  student_id: string | null;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface Course {
  id: string;
  school_id: string;
  title: string;
  description: string;
  subject: string | null;
  grade_levels: number[];
  credits: number | null;
  cover_url: string | null;
  status: CourseStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: string;
  school_id: string;
  course_id: string;
  term_id: string;
  name: string;
  status: SectionStatus;
  created_at: string;
}

export interface SectionEnrollment {
  id: string;
  school_id: string;
  section_id: string;
  profile_id: string;
  role: EnrollmentRole;
  status: EnrollmentStatus;
  enrolled_at: string;
  completed_at: string | null;
}

export interface Module {
  id: string;
  section_id: string;
  title: string;
  position: number;
  unlock_mode: ModuleUnlock;
  prerequisite_module_id: string | null;
  published: boolean;
}

export interface ModuleItem {
  id: string;
  module_id: string;
  position: number;
  kind: ItemKind;
  title: string;
  summary: string;
  content: string;
  video_url: string | null;
  url: string | null;
  duration_minutes: number;
  required: boolean;
  published: boolean;
  pass_mark: number;
}

/** Row of module_item_catalog — browsing metadata without the body. */
export interface ModuleItemSummary {
  id: string;
  module_id: string;
  section_id: string;
  position: number;
  kind: ItemKind;
  title: string;
  summary: string;
  duration_minutes: number;
  required: boolean;
  published: boolean;
  pass_mark: number;
}

export interface ModuleItemProgress {
  id: string;
  item_id: string;
  student_id: string;
  started_at: string;
  completed_at: string | null;
}

export interface LiveSession {
  id: string;
  section_id: string;
  title: string;
  provider: LiveProvider;
  external_meeting_id: string | null;
  join_url: string | null;
  starts_at: string;
  duration_minutes: number;
  recording_url: string | null;
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

export type QuizQuestionKind = "single_choice" | "multi_choice";

/** A question as the student sees it — no answer key, no explanation. */
export interface QuizQuestionPrompt {
  id: string;
  item_id: string;
  prompt: string;
  kind: QuizQuestionKind;
  points: number;
  position: number;
}

/** An option as the student sees it — no is_correct. */
export interface QuizOptionChoice {
  id: string;
  question_id: string;
  label: string;
  position: number;
}

export interface QuizQuestion extends QuizQuestionPrompt {
  options: QuizOptionChoice[];
}

export interface QuizAttempt {
  id: string;
  item_id: string;
  student_id: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  max_score: number | null;
  pass_mark: number | null;
  passed: boolean | null;
}

/** One row of quiz_attempt_review() — only available once graded. */
export interface QuizReviewRow {
  question_id: string;
  prompt: string;
  explanation: string;
  points: number;
  question_position: number;
  is_correct: boolean;
  selected_option_ids: string[];
  correct_option_ids: string[];
  selected_labels: string[];
  correct_labels: string[];
}

/** Grade levels as people say them: -1 is pre-K, 0 is kindergarten. */
export function gradeLabel(level: number): string {
  if (level <= -1) return "Pre-K";
  if (level === 0) return "K";
  return `Grade ${level}`;
}

export const GRADE_LEVELS: number[] = Array.from({ length: 14 }, (_, i) => i - 1);
