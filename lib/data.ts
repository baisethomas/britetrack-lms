import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildStreakDays,
  computeStreak,
  deriveOutlineState,
  type ItemState,
  type ModuleState,
  type StreakDay,
} from "@/lib/progress";
import type {
  Course,
  EnrollmentRole,
  EnrollmentStatus,
  LiveSession,
  Membership,
  Module,
  ModuleItemSummary,
  Profile,
  School,
  SchoolRole,
  Section,
  Student,
  Term,
} from "@/lib/types";

export const SCHOOL_COOKIE = "bt_school";

/** The signed-in user's profile, or a redirect to /login. Cached per request. */
export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");
  return profile as Profile;
});

export interface AppContext {
  profile: Profile;
  /** Every school the person can see: memberships plus any they administer as an org admin. */
  schools: School[];
  /** The school the UI is currently scoped to, or null when there is none to pick. */
  school: School | null;
  /** The person's roles at the active school. */
  roles: Set<SchoolRole>;
  isAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  isGuardian: boolean;
}

/**
 * Who the caller is *here*: their profile, the school the UI is scoped to,
 * and their roles at it. A person may belong to several schools; the active
 * one is remembered in a cookie and defaults to the first.
 */
export const getContext = cache(async (): Promise<AppContext> => {
  const profile = await getProfile();
  const supabase = await createClient();

  const [{ data: schools }, { data: memberships }, { data: orgMemberships }] =
    await Promise.all([
      supabase.from("schools").select("*").order("name"),
      supabase
        .from("memberships")
        .select("*")
        .eq("profile_id", profile.id)
        .eq("status", "active"),
      supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("profile_id", profile.id),
    ]);

  const visible = (schools ?? []) as School[];
  const jar = await cookies();
  const wanted = jar.get(SCHOOL_COOKIE)?.value;
  const school = visible.find((s) => s.id === wanted) ?? visible[0] ?? null;

  const roles = new Set<SchoolRole>();
  if (school) {
    for (const m of (memberships ?? []) as Membership[]) {
      if (m.school_id === school.id) roles.add(m.role);
    }
    const adminOrgs = new Set((orgMemberships ?? []).map((o) => o.organization_id as string));
    if (adminOrgs.has(school.organization_id)) roles.add("school_admin");
  }

  return {
    profile,
    schools: visible,
    school,
    roles,
    isAdmin: roles.has("school_admin"),
    isTeacher: roles.has("teacher"),
    isStudent: roles.has("student"),
    isGuardian: roles.has("guardian"),
  };
});

/** Context for pages inside the app shell: a person with no school goes to onboarding. */
export async function requireSchool(): Promise<AppContext & { school: School }> {
  const ctx = await getContext();
  if (!ctx.school) redirect("/onboarding");
  return ctx as AppContext & { school: School };
}

export interface SectionCard extends Section {
  course: Pick<Course, "id" | "title" | "subject">;
  term: Pick<Term, "id" | "name">;
  /** The caller's role in the section, when enrolled. */
  my_role: EnrollmentRole | null;
}

/** Sections the caller is enrolled in at the active school, with course and term. */
export async function getMySections(ctx: AppContext): Promise<SectionCard[]> {
  if (!ctx.school) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("section_enrollments")
    .select(
      "role, sections!inner(*, courses!inner(id, title, subject), terms!inner(id, name))",
    )
    .eq("profile_id", ctx.profile.id)
    .eq("status", "active")
    .eq("school_id", ctx.school.id);

  return (data ?? [])
    .map((row) => {
      const section = row.sections as unknown as Section & {
        courses: SectionCard["course"];
        terms: SectionCard["term"];
      };
      return {
        ...section,
        course: section.courses,
        term: section.terms,
        my_role: row.role as EnrollmentRole,
      };
    })
    .filter((s) => s.status === "active")
    .sort((a, b) => a.course.title.localeCompare(b.course.title));
}

/** Every section at the school — admins see them all through RLS. */
export async function getSchoolSections(schoolId: string): Promise<SectionCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sections")
    .select("*, courses!inner(id, title, subject), terms!inner(id, name)")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => {
    const section = row as unknown as Section & {
      courses: SectionCard["course"];
      terms: SectionCard["term"];
    };
    return { ...section, course: section.courses, term: section.terms, my_role: null };
  });
}

export interface SectionOutline {
  modules: (Module & ModuleState)[];
  items: (ModuleItemSummary & ItemState)[];
  completed: number;
  total: number;
}

/**
 * A section's modules and items, annotated with one student's state. For a
 * teacher or admin, pass no student: nothing is locked and nothing is
 * complete, which is the authoring view.
 */
export async function getSectionOutline(
  sectionId: string,
  studentId?: string,
): Promise<SectionOutline> {
  const supabase = await createClient();
  const [{ data: modules }, { data: items }, { data: progress }] = await Promise.all([
    supabase.from("modules").select("*").eq("section_id", sectionId).order("position"),
    supabase
      .from("module_item_catalog")
      .select("*")
      .eq("section_id", sectionId)
      .order("position"),
    studentId
      ? supabase
          .from("module_item_progress")
          .select("item_id")
          .eq("student_id", studentId)
          .not("completed_at", "is", null)
      : Promise.resolve({ data: [] as { item_id: string }[] }),
  ]);

  const completedIds = new Set((progress ?? []).map((p) => p.item_id as string));
  const state = deriveOutlineState(
    (modules ?? []) as Module[],
    (items ?? []) as ModuleItemSummary[],
    completedIds,
  );
  if (!studentId) {
    // Authoring view: nothing is gated for the person building it.
    state.items = state.items.map((i) => ({ ...i, locked: false }));
  }
  const required = state.items.filter((i) => i.required && i.published);
  return {
    ...state,
    completed: required.filter((i) => i.completed).length,
    total: required.length,
  };
}

/** The first open, unfinished item — where "continue" should go. */
export function nextItem(outline: SectionOutline): (ModuleItemSummary & ItemState) | undefined {
  const order = new Map(outline.modules.map((m, i) => [m.id, i]));
  return [...outline.items]
    .sort(
      (a, b) =>
        (order.get(a.module_id) ?? 0) - (order.get(b.module_id) ?? 0) ||
        a.position - b.position,
    )
    .find((i) => !i.completed && !i.locked && i.published);
}

export interface StreakSummary {
  streak: number;
  days: StreakDay[];
}

export async function getStreakSummary(studentId: string): Promise<StreakSummary> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("module_item_progress")
    .select("completed_at")
    .eq("student_id", studentId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(365);
  const dates = (data ?? []).map((p) => p.completed_at as string);
  return { streak: computeStreak(dates), days: buildStreakDays(dates) };
}

/** Live sessions for a set of sections from now on, soonest first. */
export async function getUpcomingSessions(
  sectionIds: string[],
  limit = 5,
): Promise<(LiveSession & { section_name: string; course_title: string; live: boolean })[]> {
  if (sectionIds.length === 0) return [];
  const supabase = await createClient();
  const now = Date.now();
  const { data } = await supabase
    .from("live_sessions")
    .select("*, sections!inner(name, courses!inner(title))")
    .in("section_id", sectionIds)
    .gte("starts_at", new Date(now - 60 * 60 * 1000).toISOString())
    .order("starts_at")
    .limit(limit);
  return (data ?? []).map((row) => {
    const s = row.sections as unknown as { name: string; courses: { title: string } };
    const session = row as unknown as LiveSession;
    const start = new Date(session.starts_at).getTime();
    // "Live" is decided when the page renders; it is a hint, not a gate.
    const live = start <= now && now <= start + session.duration_minutes * 60_000;
    return { ...session, section_name: s.name, course_title: s.courses.title, live };
  });
}

export interface ChildSummary {
  profile: Pick<Profile, "id" | "full_name">;
  student: Student | null;
  sections: SectionCard[];
}

/** A guardian's children with their current classes. */
export async function getChildren(guardianId: string): Promise<ChildSummary[]> {
  const supabase = await createClient();
  const { data: links } = await supabase
    .from("guardian_links")
    .select("student_id, profiles!guardian_links_student_id_fkey(id, full_name)")
    .eq("guardian_id", guardianId);

  return Promise.all(
    (links ?? []).map(async (link) => {
      const profile = link.profiles as unknown as Pick<Profile, "id" | "full_name">;
      const [{ data: student }, { data: enrolments }] = await Promise.all([
        supabase.from("students").select("*").eq("profile_id", profile.id).maybeSingle(),
        supabase
          .from("section_enrollments")
          .select("role, sections!inner(*, courses!inner(id, title, subject), terms!inner(id, name))")
          .eq("profile_id", profile.id)
          .eq("role", "student")
          .eq("status", "active"),
      ]);
      const sections = (enrolments ?? []).map((row) => {
        const section = row.sections as unknown as Section & {
          courses: SectionCard["course"];
          terms: SectionCard["term"];
        };
        return { ...section, course: section.courses, term: section.terms, my_role: null };
      });
      return { profile, student: (student as Student) ?? null, sections };
    }),
  );
}

/** Initials for an avatar fallback. */
export function initialsOf(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/** One section with its course and term, or null if the caller cannot see it. */
export async function getSection(sectionId: string): Promise<SectionCard | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sections")
    .select("*, courses!inner(id, title, subject), terms!inner(id, name)")
    .eq("id", sectionId)
    .maybeSingle();
  if (!data) return null;
  const section = data as unknown as Section & {
    courses: SectionCard["course"];
    terms: SectionCard["term"];
  };
  return { ...section, course: section.courses, term: section.terms, my_role: null };
}

export type SectionViewRole = "admin" | EnrollmentRole | "guardian";

/**
 * What the caller is to a section: an admin of its school, enrolled in it,
 * or the guardian of a student in it. Decides which view the page renders;
 * RLS has already decided what the data contains.
 */
export async function getSectionViewRole(
  ctx: AppContext,
  sectionId: string,
): Promise<SectionViewRole | null> {
  if (ctx.isAdmin) return "admin";
  const supabase = await createClient();
  const { data: mine } = await supabase
    .from("section_enrollments")
    .select("role")
    .eq("section_id", sectionId)
    .eq("profile_id", ctx.profile.id)
    .eq("status", "active")
    .maybeSingle();
  if (mine) return mine.role as EnrollmentRole;
  if (ctx.isGuardian) {
    const { count } = await supabase
      .from("section_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("section_id", sectionId)
      .eq("role", "student");
    if (count) return "guardian";
  }
  return null;
}

export interface RosterRow {
  id: string;
  profile_id: string;
  role: EnrollmentRole;
  status: EnrollmentStatus;
  completed_at: string | null;
  full_name: string;
  grade_level: number | null;
}

/** Everyone enrolled in a section, staff first then students by name. */
export async function getRoster(sectionId: string): Promise<RosterRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("section_enrollments")
    .select("id, profile_id, role, status, completed_at, profiles!inner(full_name), students(grade_level)")
    .eq("section_id", sectionId)
    .eq("status", "active");
  const order: Record<EnrollmentRole, number> = { teacher: 0, co_teacher: 1, aide: 2, student: 3 };
  return (data ?? [])
    .map((row) => {
      const r = row as unknown as {
        id: string;
        profile_id: string;
        role: EnrollmentRole;
        status: EnrollmentStatus;
        completed_at: string | null;
        profiles: { full_name: string };
        students: { grade_level: number } | null;
      };
      return {
        id: r.id,
        profile_id: r.profile_id,
        role: r.role,
        status: r.status,
        completed_at: r.completed_at,
        full_name: r.profiles.full_name,
        grade_level: r.students?.grade_level ?? null,
      };
    })
    .sort((a, b) => order[a.role] - order[b.role] || a.full_name.localeCompare(b.full_name));
}
