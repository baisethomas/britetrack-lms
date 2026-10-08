-- BriteTrack LMS — baseline schema.
--
-- A K-12 learning platform is school-shaped, not course-shaped. The unit of
-- tenancy is the school (grouped under an organization so a district can own
-- several), the unit of teaching is the section (one teacher, one roster, one
-- term), and a person's role is scoped to a school rather than global — a
-- teacher owns their sections and nobody else's.
--
-- Authorization lives here, in RLS, so that no client can bypass it. Every
-- rule below is exercised by tests/db against a real Postgres.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.organization_kind as enum ('independent', 'district', 'network');
create type public.org_role as enum ('org_admin');
create type public.school_role as enum ('school_admin', 'teacher', 'student', 'guardian', 'staff');
create type public.membership_status as enum ('active', 'inactive');
create type public.course_status as enum ('draft', 'published', 'archived');
create type public.section_status as enum ('active', 'archived');
create type public.enrollment_role as enum ('teacher', 'co_teacher', 'aide', 'student');
create type public.enrollment_status as enum ('active', 'dropped');
create type public.module_unlock as enum ('free', 'sequential');
create type public.item_kind as enum ('page', 'video', 'quiz', 'live_session', 'link');
create type public.live_provider as enum ('zoom', 'google_meet', 'external');
create type public.quiz_question_kind as enum ('single_choice', 'multi_choice');
create type public.notification_type as enum (
  'enrollment', 'item_unlocked', 'live_session', 'announcement', 'progress'
);

-- ---------------------------------------------------------------------------
-- Tenancy: organizations → schools → terms → grading periods
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.organization_kind not null default 'independent',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  timezone text not null default 'America/Los_Angeles',
  -- Lowest and highest grade served; -1 is pre-K, 0 is kindergarten.
  grade_min smallint not null default 0 check (grade_min between -1 and 12),
  grade_max smallint not null default 12 check (grade_max between -1 and 12),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (grade_min <= grade_max)
);
create index schools_organization_idx on public.schools (organization_id);

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on)
);
create index terms_school_idx on public.terms (school_id, starts_on);

create table public.grading_periods (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms (id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  check (ends_on > starts_on)
);
create index grading_periods_term_idx on public.grading_periods (term_id, starts_on);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
-- Identity only. A person's role is a membership in a school, below; nobody
-- is an "admin" in general, only of somewhere.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null default 'org_admin',
  created_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.school_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (school_id, profile_id, role)
);
create index memberships_profile_idx on public.memberships (profile_id, status);
create index memberships_school_role_idx on public.memberships (school_id, role, status);

-- Student record: the K-12 facts a profile does not carry.
create table public.students (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  grade_level smallint not null check (grade_level between -1 and 12),
  student_number text,
  -- Needed for COPPA: under-13 accounts require verifiable guardian consent.
  date_of_birth date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, student_number)
);
create index students_school_grade_idx on public.students (school_id, grade_level);

create table public.guardian_links (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  relationship text not null default 'guardian',
  created_at timestamptz not null default now(),
  unique (guardian_id, student_id),
  check (guardian_id <> student_id)
);
create index guardian_links_student_idx on public.guardian_links (student_id);

-- An invitation ties an email to a role at a school before the person has an
-- account. Accepting it (below) is what creates the membership, and only the
-- holder of that email may accept — so a leaked link is not a leaked seat.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  email text not null,
  role public.school_role not null,
  -- For a student invite: the grade they enter at.
  grade_level smallint check (grade_level between -1 and 12),
  -- For a guardian invite: the student they are linked to on acceptance.
  student_id uuid references public.profiles (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (role <> 'guardian' or student_id is not null),
  check (role <> 'student' or grade_level is not null)
);
create index invitations_school_idx on public.invitations (school_id, accepted_at);
create index invitations_email_idx on public.invitations (lower(email));

-- ---------------------------------------------------------------------------
-- Teaching: courses → sections → enrollments
-- ---------------------------------------------------------------------------
-- The catalog entry: what "Algebra I" is.
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  title text not null,
  description text not null default '',
  subject text,
  grade_levels smallint[] not null default '{}',
  -- High-school credit value; null for elementary and middle school.
  credits numeric(4, 2),
  cover_url text,
  status public.course_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_school_idx on public.courses (school_id, status);

-- The class: one course, one term, one roster.
create table public.sections (
  id uuid primary key default gen_random_uuid(),
  -- Denormalised from the course so RLS can check school membership without
  -- a join; a trigger keeps it honest.
  school_id uuid not null references public.schools (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  term_id uuid not null references public.terms (id) on delete restrict,
  name text not null,
  status public.section_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sections_school_idx on public.sections (school_id, status);
create index sections_course_idx on public.sections (course_id);
create index sections_term_idx on public.sections (term_id);

create table public.section_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  section_id uuid not null references public.sections (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.enrollment_role not null default 'student',
  status public.enrollment_status not null default 'active',
  enrolled_at timestamptz not null default now(),
  -- Derived by trigger when every required item is complete; never written
  -- by clients.
  completed_at timestamptz,
  unique (section_id, profile_id)
);
create index section_enrollments_profile_idx on public.section_enrollments (profile_id, status);
create index section_enrollments_section_role_idx
  on public.section_enrollments (section_id, role, status);

-- ---------------------------------------------------------------------------
-- Content: modules → items → progress
-- ---------------------------------------------------------------------------
create table public.modules (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections (id) on delete cascade,
  title text not null,
  position int not null,
  unlock_mode public.module_unlock not null default 'sequential',
  -- Must be complete before this module opens; must belong to the same section.
  prerequisite_module_id uuid references public.modules (id) on delete set null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, position),
  check (prerequisite_module_id is distinct from id)
);
create index modules_section_idx on public.modules (section_id, position);

create table public.module_items (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules (id) on delete cascade,
  position int not null,
  kind public.item_kind not null default 'page',
  title text not null,
  summary text not null default '',
  -- Body for pages; speaker notes for videos. Rich text arrives in phase 2.
  content text not null default '',
  video_url text,
  url text,
  duration_minutes int not null default 0 check (duration_minutes >= 0),
  -- Required items gate completion and sequential unlocking; optional ones
  -- are enrichment.
  required boolean not null default true,
  published boolean not null default true,
  -- Percent of available points a quiz item needs to pass.
  pass_mark int not null default 70 check (pass_mark between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, position)
);
create index module_items_module_idx on public.module_items (module_id, position);

create table public.module_item_progress (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.module_items (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (item_id, student_id)
);
create index module_item_progress_student_idx
  on public.module_item_progress (student_id, completed_at);

-- ---------------------------------------------------------------------------
-- Quizzes (re-homed on module items; the answer key never leaves the database)
-- ---------------------------------------------------------------------------
create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.module_items (id) on delete cascade,
  prompt text not null,
  explanation text not null default '',
  kind public.quiz_question_kind not null default 'single_choice',
  points int not null default 1 check (points > 0),
  position int not null,
  -- Retired, never deleted: scored attempts reference it.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (item_id, position)
);
create index quiz_questions_item_idx on public.quiz_questions (item_id, position);

create table public.quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  label text not null,
  is_correct boolean not null default false,
  position int not null,
  unique (question_id, position)
);
create index quiz_options_question_idx on public.quiz_options (question_id, position);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.module_items (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score int,
  max_score int,
  -- The threshold actually applied, so moving the item's pass mark later
  -- cannot rewrite what a historical result claims was required.
  pass_mark int,
  passed boolean
);
create index quiz_attempts_student_idx on public.quiz_attempts (student_id, item_id);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts (id) on delete cascade,
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  selected_option_ids uuid[] not null default '{}',
  is_correct boolean not null default false,
  unique (attempt_id, question_id)
);

-- ---------------------------------------------------------------------------
-- Live classes and notifications
-- ---------------------------------------------------------------------------
-- Provider-agnostic: a school brings the meeting tool it already has. An
-- embedded classroom lands behind the same row later.
create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections (id) on delete cascade,
  title text not null,
  provider public.live_provider not null default 'external',
  external_meeting_id text,
  join_url text,
  starts_at timestamptz not null,
  duration_minutes int not null default 45 check (duration_minutes > 0),
  recording_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index live_sessions_section_idx on public.live_sessions (section_id, starts_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null default 'announcement',
  title text not null,
  body text not null default '',
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at);

-- ---------------------------------------------------------------------------
-- Housekeeping triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organizations_updated before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger schools_updated before update on public.schools
  for each row execute function public.set_updated_at();
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger students_updated before update on public.students
  for each row execute function public.set_updated_at();
create trigger courses_updated before update on public.courses
  for each row execute function public.set_updated_at();
create trigger sections_updated before update on public.sections
  for each row execute function public.set_updated_at();
create trigger modules_updated before update on public.modules
  for each row execute function public.set_updated_at();
create trigger module_items_updated before update on public.module_items
  for each row execute function public.set_updated_at();

-- Signup creates an identity and nothing else. Roles come from invitations
-- or from founding a school, never from client-controlled metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A section's school is its course's school, and its term must belong there
-- too. Set, not trusted. Integrity triggers run as definer: they consult rows
-- the caller may not be allowed to read, and a hidden row must not pass for a
-- missing one.
create or replace function public.sections_derive_school()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_course_school uuid;
  v_term_school uuid;
begin
  select school_id into v_course_school from public.courses where id = new.course_id;
  select school_id into v_term_school from public.terms where id = new.term_id;
  if v_course_school is null then
    raise exception 'course not found';
  end if;
  if v_term_school is distinct from v_course_school then
    raise exception 'term belongs to a different school than the course';
  end if;
  new.school_id := v_course_school;
  return new;
end;
$$;

create trigger sections_derive_school before insert or update of course_id, term_id
  on public.sections
  for each row execute function public.sections_derive_school();

-- An enrollment carries its section's school, and the person must hold the
-- matching membership there: teachers teach, students learn, nobody is
-- enrolled somewhere they do not belong.
create or replace function public.section_enrollments_check()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_school uuid;
  v_needed public.school_role;
begin
  select school_id into v_school from public.sections where id = new.section_id;
  if v_school is null then
    raise exception 'section not found';
  end if;
  new.school_id := v_school;

  v_needed := case when new.role = 'student' then 'student'::public.school_role
                   else 'teacher'::public.school_role end;
  if not exists (
    select 1 from public.memberships m
    where m.profile_id = new.profile_id
      and m.school_id = v_school
      and m.role = v_needed
      and m.status = 'active'
  ) then
    raise exception 'person is not an active % at this school', v_needed;
  end if;
  return new;
end;
$$;

create trigger section_enrollments_check before insert or update of section_id, profile_id, role
  on public.section_enrollments
  for each row execute function public.section_enrollments_check();

-- completed_at is derived by sync_section_completion(), which runs as the
-- schema owner. A request from the API roles — admin, teacher or student —
-- cannot set it: the column keeps whatever it already had.
create or replace function public.section_enrollments_guard_completion()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.completed_at := null;
    elsif new.completed_at is distinct from old.completed_at then
      new.completed_at := old.completed_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger section_enrollments_guard_completion before insert or update
  on public.section_enrollments
  for each row execute function public.section_enrollments_guard_completion();

-- A prerequisite module must live in the same section.
create or replace function public.modules_check_prerequisite()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.prerequisite_module_id is not null and not exists (
    select 1 from public.modules m
    where m.id = new.prerequisite_module_id and m.section_id = new.section_id
  ) then
    raise exception 'prerequisite module must belong to the same section';
  end if;
  return new;
end;
$$;

create trigger modules_check_prerequisite before insert or update of prerequisite_module_id
  on public.modules
  for each row execute function public.modules_check_prerequisite();

-- ---------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so policies can consult tables that are
-- themselves under RLS without recursing.
-- ---------------------------------------------------------------------------
create or replace function public.has_school_role(p_school uuid, p_roles public.school_role[])
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.profile_id = auth.uid()
      and m.school_id = p_school
      and m.status = 'active'
      and m.role = any (p_roles)
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships om
    where om.profile_id = auth.uid() and om.organization_id = p_org
  );
$$;

create or replace function public.is_school_admin(p_school uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.has_school_role(p_school, '{school_admin}')
      or exists (
        select 1 from public.schools s
        where s.id = p_school and public.is_org_admin(s.organization_id)
      );
$$;

create or replace function public.is_school_member(p_school uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.profile_id = auth.uid() and m.school_id = p_school and m.status = 'active'
  ) or public.is_school_admin(p_school);
$$;

create or replace function public.is_guardian_of(p_student uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.guardian_links g
    where g.guardian_id = auth.uid() and g.student_id = p_student
  );
$$;

create or replace function public.section_role(p_section uuid)
returns public.enrollment_role
language sql
stable
security definer set search_path = public
as $$
  select e.role from public.section_enrollments e
  where e.section_id = p_section and e.profile_id = auth.uid() and e.status = 'active'
  limit 1;
$$;

-- Teachers and co-teachers run the section; aides read it. These coalesce to
-- false for a non-member: a NULL here would make `if not teaches_section(...)`
-- in a PL/pgSQL body skip its raise and fail open.
create or replace function public.teaches_section(p_section uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(public.section_role(p_section) in ('teacher', 'co_teacher'), false);
$$;

create or replace function public.staffs_section(p_section uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(public.section_role(p_section) in ('teacher', 'co_teacher', 'aide'), false);
$$;

create or replace function public.is_section_student(p_section uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(public.section_role(p_section) = 'student', false);
$$;

create or replace function public.section_school(p_section uuid)
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select school_id from public.sections where id = p_section;
$$;

create or replace function public.guardian_in_section(p_section uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.section_enrollments e
    join public.guardian_links g on g.student_id = e.profile_id
    where e.section_id = p_section
      and e.role = 'student'
      and e.status = 'active'
      and g.guardian_id = auth.uid()
  );
$$;

create or replace function public.can_manage_section(p_section uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.teaches_section(p_section)
      or public.is_school_admin(public.section_school(p_section));
$$;

create or replace function public.can_view_section(p_section uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.section_role(p_section) is not null
      or public.is_school_admin(public.section_school(p_section))
      or public.guardian_in_section(p_section);
$$;

-- Does the caller staff any section this student is enrolled in?
create or replace function public.staffs_student(p_student uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.section_enrollments s
    join public.section_enrollments t on t.section_id = s.section_id
    where s.profile_id = p_student and s.role = 'student' and s.status = 'active'
      and t.profile_id = auth.uid()
      and t.role in ('teacher', 'co_teacher', 'aide')
      and t.status = 'active'
  );
$$;

-- Who may see whom: yourself, your students and teachers, your children, and
-- everyone at a school you administer.
create or replace function public.can_view_profile(p_profile uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select p_profile = auth.uid()
      or public.is_guardian_of(p_profile)
      or public.staffs_student(p_profile)
      or exists (
        -- The profile staffs a section the caller is in.
        select 1
        from public.section_enrollments mine
        join public.section_enrollments theirs on theirs.section_id = mine.section_id
        where mine.profile_id = auth.uid() and mine.status = 'active'
          and theirs.profile_id = p_profile
          and theirs.role in ('teacher', 'co_teacher', 'aide')
          and theirs.status = 'active'
      )
      or exists (
        select 1 from public.memberships m
        where m.profile_id = p_profile and public.is_school_admin(m.school_id)
      )
      or exists (
        -- A guardian of one of the caller's students.
        select 1 from public.guardian_links g
        where g.guardian_id = p_profile and public.staffs_student(g.student_id)
      );
$$;

create or replace function public.item_section(p_item uuid)
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select m.section_id
  from public.module_items i
  join public.modules m on m.id = i.module_id
  where i.id = p_item;
$$;

create or replace function public.is_quiz_item(p_item uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.module_items where id = p_item and kind = 'quiz'
  );
$$;

-- Every required, published item in a module is complete for the student.
create or replace function public.module_complete_for(p_module uuid, p_student uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select not exists (
    select 1 from public.module_items i
    where i.module_id = p_module and i.required and i.published
      and not exists (
        select 1 from public.module_item_progress p
        where p.item_id = i.id and p.student_id = p_student and p.completed_at is not null
      )
  );
$$;

-- The student's gate to an item's content. Unlocking is derived, never
-- stored: an item is open when its module is reachable and, if the module is
-- sequential, every required item before it is done.
create or replace function public.can_access_item(p_item uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.module_items i
    join public.modules m on m.id = i.module_id
    join public.sections s on s.id = m.section_id
    where i.id = p_item
      and i.published
      and m.published
      and s.status = 'active'
      and public.is_section_student(s.id)
      and (
        m.prerequisite_module_id is null
        or public.module_complete_for(m.prerequisite_module_id, auth.uid())
      )
      and (
        m.unlock_mode = 'free'
        or not exists (
          select 1 from public.module_items prev
          where prev.module_id = m.id
            and prev.position < i.position
            and prev.required
            and prev.published
            and not exists (
              select 1 from public.module_item_progress p
              where p.item_id = prev.id
                and p.student_id = auth.uid()
                and p.completed_at is not null
            )
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Completion: derived, never written by clients
-- ---------------------------------------------------------------------------
create or replace function public.sync_section_completion()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_section uuid;
  v_student uuid;
  v_all_done boolean;
begin
  v_student := coalesce(new.student_id, old.student_id);
  v_section := public.item_section(coalesce(new.item_id, old.item_id));
  if v_section is null then
    return coalesce(new, old);
  end if;

  select not exists (
    select 1
    from public.module_items i
    join public.modules m on m.id = i.module_id
    where m.section_id = v_section and m.published and i.published and i.required
      and not exists (
        select 1 from public.module_item_progress p
        where p.item_id = i.id and p.student_id = v_student and p.completed_at is not null
      )
  ) into v_all_done;

  update public.section_enrollments
  set completed_at = case when v_all_done then coalesce(completed_at, now()) end
  where section_id = v_section and profile_id = v_student and role = 'student';

  return coalesce(new, old);
end;
$$;

create trigger module_item_progress_completion
  after insert or update or delete on public.module_item_progress
  for each row execute function public.sync_section_completion();

-- A newly required item reopens any enrollment that had finished.
create or replace function public.reset_completion_on_new_item()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.required and new.published then
    update public.section_enrollments
    set completed_at = null
    where section_id = (select section_id from public.modules where id = new.module_id)
      and completed_at is not null;
  end if;
  return new;
end;
$$;

create trigger module_items_reset_completion
  after insert on public.module_items
  for each row execute function public.reset_completion_on_new_item();

-- ---------------------------------------------------------------------------
-- Founding a school and joining one
-- ---------------------------------------------------------------------------
/**
 * Self-serve: any signed-in person can found a school. They become its first
 * administrator and the organisation's administrator; a district later adds
 * more schools under the same organisation.
 */
create or replace function public.create_school(
  p_school_name text,
  p_organization_name text default null,
  p_timezone text default 'America/Los_Angeles'
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_school uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_school_name), '') = '' then
    raise exception 'school name is required';
  end if;

  insert into public.organizations (name, kind)
  values (coalesce(nullif(trim(p_organization_name), ''), trim(p_school_name)), 'independent')
  returning id into v_org;

  insert into public.schools (organization_id, name, timezone)
  values (v_org, trim(p_school_name), coalesce(p_timezone, 'America/Los_Angeles'))
  returning id into v_school;

  insert into public.organization_memberships (organization_id, profile_id)
  values (v_org, v_user);
  insert into public.memberships (school_id, profile_id, role)
  values (v_school, v_user, 'school_admin');

  update public.profiles set onboarded = true where id = v_user;
  return v_school;
end;
$$;

/**
 * Accept an invitation. Only the account whose email the invitation names
 * may accept it — the token alone is not enough — so forwarding the link
 * does not hand the seat to someone else.
 */
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv public.invitations%rowtype;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user;

  select * into v_inv from public.invitations where token = p_token;
  if v_inv.id is null then
    raise exception 'invitation not found';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invitation already accepted';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation expired';
  end if;
  if lower(v_inv.email) is distinct from v_email then
    raise exception 'invitation was sent to a different email address';
  end if;

  insert into public.memberships (school_id, profile_id, role)
  values (v_inv.school_id, v_user, v_inv.role)
  on conflict (school_id, profile_id, role) do update set status = 'active';

  if v_inv.role = 'student' then
    insert into public.students (profile_id, school_id, grade_level)
    values (v_user, v_inv.school_id, v_inv.grade_level)
    on conflict (profile_id) do update
      set school_id = excluded.school_id, grade_level = excluded.grade_level;
  elsif v_inv.role = 'guardian' then
    insert into public.guardian_links (guardian_id, student_id)
    values (v_user, v_inv.student_id)
    on conflict (guardian_id, student_id) do nothing;
  end if;

  update public.invitations
  set accepted_at = now(), accepted_by = v_user
  where id = v_inv.id;

  update public.profiles set onboarded = true where id = v_user;
  return v_inv.school_id;
end;
$$;

/**
 * Create a section. An administrator may create any section at the school;
 * a teacher may create one and is enrolled as its teacher in the same step,
 * so a teacher can set up their own class without waiting on an admin.
 */
create or replace function public.create_section(
  p_course_id uuid,
  p_term_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_school uuid;
  v_section uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select school_id into v_school from public.courses where id = p_course_id;
  if v_school is null then
    raise exception 'course not found';
  end if;
  if not (public.is_school_admin(v_school) or public.has_school_role(v_school, '{teacher}')) then
    raise exception 'forbidden';
  end if;

  insert into public.sections (school_id, course_id, term_id, name)
  values (v_school, p_course_id, p_term_id, p_name)
  returning id into v_section;

  if public.has_school_role(v_school, '{teacher}') then
    insert into public.section_enrollments (section_id, profile_id, role)
    values (v_section, v_user, 'teacher');
  end if;
  return v_section;
end;
$$;

-- Administrators need emails to roster people; the API roles cannot read
-- auth.users directly, so these expose exactly what is needed, to admins only.
create or replace function public.school_people(p_school uuid)
returns table (
  id uuid,
  email text,
  full_name text,
  roles public.school_role[],
  grade_level smallint,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_school_admin(p_school) then
    raise exception 'forbidden';
  end if;
  return query
    select p.id,
           u.email::text,
           p.full_name,
           array_agg(m.role order by m.role),
           st.grade_level,
           p.created_at
    from public.memberships m
    join public.profiles p on p.id = m.profile_id
    join auth.users u on u.id = p.id
    left join public.students st on st.profile_id = p.id and st.school_id = p_school
    where m.school_id = p_school and m.status = 'active'
    group by p.id, u.email, p.full_name, st.grade_level, p.created_at
    order by p.full_name, p.created_at;
end;
$$;

create or replace function public.find_school_students_by_email(p_school uuid, p_emails text[])
returns table (id uuid, email text)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_school_admin(p_school) then
    raise exception 'forbidden';
  end if;
  return query
    select p.id, u.email::text
    from public.memberships m
    join public.profiles p on p.id = m.profile_id
    join auth.users u on u.id = p.id
    where m.school_id = p_school
      and m.role = 'student'
      and m.status = 'active'
      and lower(u.email) = any (p_emails);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grading (carried forward: the answer key is read only here)
-- ---------------------------------------------------------------------------
create or replace function public.normalise_option_ids(ids uuid[])
returns uuid[]
language sql
immutable
as $$
  select coalesce(array_agg(v order by v), '{}'::uuid[])
  from (select distinct unnest(coalesce(ids, '{}'::uuid[])) as v) t;
$$;

/**
 * Create a question with its options atomically, validating here so the
 * rules bind any caller: at least two options, at least one correct, exactly
 * one correct for a single-choice question.
 */
create or replace function public.create_quiz_question(
  p_item_id uuid,
  p_prompt text,
  p_explanation text,
  p_kind public.quiz_question_kind,
  p_points int,
  p_labels text[],
  p_correct boolean[]
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_question uuid;
  v_correct_count int;
  i int;
begin
  if not public.can_manage_section(public.item_section(p_item_id)) then
    raise exception 'forbidden';
  end if;
  if not public.is_quiz_item(p_item_id) then
    raise exception 'not a quiz item';
  end if;
  if coalesce(array_length(p_labels, 1), 0) <> coalesce(array_length(p_correct, 1), 0) then
    raise exception 'labels and correctness flags must line up';
  end if;
  if coalesce(array_length(p_labels, 1), 0) < 2 then
    raise exception 'a question needs at least two options';
  end if;

  -- Serialise position allocation per item so concurrent authors cannot
  -- collide on the unique constraint.
  perform pg_advisory_xact_lock(hashtext(p_item_id::text));

  select count(*) into v_correct_count from unnest(p_correct) c where c;
  if v_correct_count = 0 then
    raise exception 'a question needs at least one correct option';
  end if;
  if p_kind = 'single_choice' and v_correct_count > 1 then
    raise exception 'a single-choice question needs exactly one correct option';
  end if;

  insert into public.quiz_questions (item_id, prompt, explanation, kind, points, position)
  values (
    p_item_id,
    p_prompt,
    coalesce(p_explanation, ''),
    p_kind,
    greatest(coalesce(p_points, 1), 1),
    coalesce((select max(position) from public.quiz_questions where item_id = p_item_id), 0) + 1
  )
  returning id into v_question;

  for i in 1 .. array_length(p_labels, 1) loop
    insert into public.quiz_options (question_id, label, is_correct, position)
    values (v_question, p_labels[i], p_correct[i], i);
  end loop;

  return v_question;
end;
$$;

/**
 * Grade a submission. Scoring is all-or-nothing per question. Runs as
 * definer because it is the only thing permitted to read the key; it
 * re-checks access itself rather than trusting the caller.
 */
create or replace function public.submit_quiz_attempt(p_item_id uuid, p_answers jsonb)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_student uuid := auth.uid();
  v_attempt uuid;
  v_max int := 0;
  v_score int := 0;
  v_pass_mark int;
  v_passed boolean;
  v_question record;
  v_selected uuid[];
  v_correct uuid[];
  v_is_correct boolean;
begin
  if v_student is null then
    raise exception 'not authenticated';
  end if;
  if not public.can_access_item(p_item_id) then
    raise exception 'forbidden';
  end if;

  select pass_mark into v_pass_mark
  from public.module_items where id = p_item_id and kind = 'quiz';
  if v_pass_mark is null then
    raise exception 'not a quiz item';
  end if;

  if not exists (
    select 1 from public.quiz_questions
    where item_id = p_item_id and archived_at is null
  ) then
    raise exception 'quiz has no questions';
  end if;

  insert into public.quiz_attempts (item_id, student_id)
  values (p_item_id, v_student)
  returning id into v_attempt;

  for v_question in
    select q.id, q.points
    from public.quiz_questions q
    where q.item_id = p_item_id
      and q.archived_at is null
      -- A question with no options cannot be answered and must not count.
      and exists (select 1 from public.quiz_options o where o.question_id = q.id)
    order by q.position
  loop
    v_max := v_max + v_question.points;

    -- Only options that belong to this question count, so a crafted payload
    -- cannot smuggle in ids from elsewhere.
    select public.normalise_option_ids(array_agg(o.id)) into v_selected
    from public.quiz_options o
    where o.question_id = v_question.id
      and o.id in (
        select (jsonb_array_elements_text(a -> 'option_ids'))::uuid
        from jsonb_array_elements(p_answers) a
        where (a ->> 'question_id')::uuid = v_question.id
      );
    v_selected := coalesce(v_selected, '{}'::uuid[]);

    select public.normalise_option_ids(array_agg(o.id)) into v_correct
    from public.quiz_options o
    where o.question_id = v_question.id and o.is_correct;
    v_correct := coalesce(v_correct, '{}'::uuid[]);

    v_is_correct := cardinality(v_selected) > 0 and v_selected = v_correct;
    if v_is_correct then
      v_score := v_score + v_question.points;
    end if;

    insert into public.quiz_answers (attempt_id, question_id, selected_option_ids, is_correct)
    values (v_attempt, v_question.id, v_selected, v_is_correct);
  end loop;

  v_passed := v_max > 0 and (v_score::numeric * 100 / v_max) >= v_pass_mark;

  update public.quiz_attempts
  set submitted_at = now(), score = v_score, max_score = v_max,
      pass_mark = v_pass_mark, passed = v_passed
  where id = v_attempt;

  -- Passing is what completes a quiz item; failing leaves it open to retry.
  if v_passed then
    insert into public.module_item_progress (item_id, student_id, completed_at)
    values (p_item_id, v_student, now())
    on conflict (item_id, student_id) do update set completed_at = excluded.completed_at;
  end if;

  return v_attempt;
end;
$$;

/**
 * Per-question breakdown of a graded attempt, with the key and explanations.
 * Labels travel with the review because a question may since have been
 * archived and the student-facing views no longer carry it.
 */
create or replace function public.quiz_attempt_review(p_attempt_id uuid)
returns table (
  question_id uuid,
  prompt text,
  explanation text,
  points int,
  question_position int,
  is_correct boolean,
  selected_option_ids uuid[],
  correct_option_ids uuid[],
  selected_labels text[],
  correct_labels text[]
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_submitted timestamptz;
  v_item uuid;
begin
  select a.student_id, a.submitted_at, a.item_id into v_owner, v_submitted, v_item
  from public.quiz_attempts a where a.id = p_attempt_id;
  if v_owner is null then
    raise exception 'attempt not found';
  end if;
  if v_submitted is null then
    raise exception 'attempt not submitted';
  end if;
  if not (
    v_owner = auth.uid()
    or public.is_guardian_of(v_owner)
    or public.can_manage_section(public.item_section(v_item))
    or public.staffs_section(public.item_section(v_item))
  ) then
    raise exception 'forbidden';
  end if;

  return query
    select q.id, q.prompt, q.explanation, q.points, q.position,
           ans.is_correct, ans.selected_option_ids,
           public.normalise_option_ids(array_agg(o.id) filter (where o.is_correct)),
           coalesce(
             array_agg(o.label order by o.position)
               filter (where o.id = any (ans.selected_option_ids)),
             '{}'::text[]
           ),
           coalesce(
             array_agg(o.label order by o.position) filter (where o.is_correct),
             '{}'::text[]
           )
    from public.quiz_answers ans
    join public.quiz_questions q on q.id = ans.question_id
    left join public.quiz_options o on o.question_id = q.id
    where ans.attempt_id = p_attempt_id
    group by q.id, q.prompt, q.explanation, q.points, q.position,
             ans.is_correct, ans.selected_option_ids
    order by q.position;
end;
$$;

-- ---------------------------------------------------------------------------
-- Views: what students and guardians may see of content and quizzes
-- ---------------------------------------------------------------------------
-- Browsing metadata without the body. Students see every published item in
-- their sections, locked or not, so the path ahead is visible; the body
-- itself is behind can_access_item on the base table.
create view public.module_item_catalog as
  select i.id, i.module_id, m.section_id, i.position, i.kind, i.title, i.summary,
         i.duration_minutes, i.required, i.published, i.pass_mark
  from public.module_items i
  join public.modules m on m.id = i.module_id
  where public.can_manage_section(m.section_id)
     or public.staffs_section(m.section_id)
     or (i.published and m.published and public.can_view_section(m.section_id));

-- Everything needed to answer, nothing that gives it away.
create view public.quiz_question_prompts as
  select q.id, q.item_id, q.prompt, q.kind, q.points, q.position
  from public.quiz_questions q
  where q.archived_at is null
    and (public.can_access_item(q.item_id)
         or public.can_manage_section(public.item_section(q.item_id)));

create view public.quiz_option_choices as
  select o.id, o.question_id, o.label, o.position
  from public.quiz_options o
  join public.quiz_questions q on q.id = o.question_id
  where q.archived_at is null
    and (public.can_access_item(q.item_id)
         or public.can_manage_section(public.item_section(q.item_id)));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Supabase grants the API roles access to every public table by default and
-- RLS decides the rows. The exceptions are taken away explicitly here.
revoke all on public.module_item_catalog from anon;
revoke all on public.quiz_question_prompts from anon;
revoke all on public.quiz_option_choices from anon;
grant select on public.module_item_catalog to authenticated;
grant select on public.quiz_question_prompts to authenticated;
grant select on public.quiz_option_choices to authenticated;

-- The answer key: never for anonymous callers, and never deletable — retired
-- questions keep scored attempts explicable.
revoke all on public.quiz_questions from anon, authenticated;
revoke all on public.quiz_options from anon, authenticated;
grant select, insert, update on public.quiz_questions to authenticated;
grant select, insert, update on public.quiz_options to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.schools enable row level security;
alter table public.terms enable row level security;
alter table public.grading_periods enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.memberships enable row level security;
alter table public.students enable row level security;
alter table public.guardian_links enable row level security;
alter table public.invitations enable row level security;
alter table public.courses enable row level security;
alter table public.sections enable row level security;
alter table public.section_enrollments enable row level security;
alter table public.modules enable row level security;
alter table public.module_items enable row level security;
alter table public.module_item_progress enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_options enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.live_sessions enable row level security;
alter table public.notifications enable row level security;

-- Organizations: visible to their admins and to members of any of their
-- schools; founded only through create_school().
create policy "org members read organization" on public.organizations
  for select using (
    public.is_org_admin(id)
    or exists (
      select 1 from public.schools s
      where s.organization_id = organizations.id and public.is_school_member(s.id)
    )
  );
create policy "org admins update organization" on public.organizations
  for update using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy "read own org membership" on public.organization_memberships
  for select using (profile_id = auth.uid() or public.is_org_admin(organization_id));
create policy "org admins manage org memberships" on public.organization_memberships
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- Schools: members see their school; district admins add schools to their org.
-- The org check reads organization_id off the row rather than through
-- is_school_admin(): that helper is STABLE and re-reads schools under the
-- statement's snapshot, in which a row being INSERTed ... RETURNING does not
-- exist yet.
create policy "members read school" on public.schools
  for select using (public.is_school_member(id) or public.is_org_admin(organization_id));
create policy "org admins add schools" on public.schools
  for insert with check (public.is_org_admin(organization_id));
create policy "school admins update school" on public.schools
  for update using (public.is_school_admin(id) or public.is_org_admin(organization_id))
  with check (public.is_school_admin(id) or public.is_org_admin(organization_id));

create policy "members read terms" on public.terms
  for select using (public.is_school_member(school_id));
create policy "school admins manage terms" on public.terms
  for all using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

create policy "members read grading periods" on public.grading_periods
  for select using (
    exists (select 1 from public.terms t where t.id = term_id and public.is_school_member(t.school_id))
  );
create policy "school admins manage grading periods" on public.grading_periods
  for all using (
    exists (select 1 from public.terms t where t.id = term_id and public.is_school_admin(t.school_id))
  )
  with check (
    exists (select 1 from public.terms t where t.id = term_id and public.is_school_admin(t.school_id))
  );

-- Profiles: no role column any more, so updating your own row is safe.
create policy "read visible profiles" on public.profiles
  for select using (public.can_view_profile(id));
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Memberships: yours, or everyone's at a school you administer.
create policy "read own memberships" on public.memberships
  for select using (profile_id = auth.uid() or public.is_school_admin(school_id));
create policy "school admins manage memberships" on public.memberships
  for all using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

-- Student records: the student, their guardians, their teachers, their school's admins.
create policy "read student record" on public.students
  for select using (
    profile_id = auth.uid()
    or public.is_guardian_of(profile_id)
    or public.staffs_student(profile_id)
    or public.is_school_admin(school_id)
  );
create policy "school admins manage students" on public.students
  for all using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

create policy "read guardian links" on public.guardian_links
  for select using (
    guardian_id = auth.uid()
    or student_id = auth.uid()
    or exists (
      select 1 from public.students st
      where st.profile_id = guardian_links.student_id and public.is_school_admin(st.school_id)
    )
  );
create policy "school admins manage guardian links" on public.guardian_links
  for all using (
    exists (
      select 1 from public.students st
      where st.profile_id = guardian_links.student_id and public.is_school_admin(st.school_id)
    )
  )
  with check (
    exists (
      select 1 from public.students st
      where st.profile_id = guardian_links.student_id and public.is_school_admin(st.school_id)
    )
  );

-- Invitations are an admin's instrument; acceptance goes through the RPC.
create policy "school admins manage invitations" on public.invitations
  for all using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

-- Courses: the catalog is readable school-wide; admins and teachers author.
create policy "members read courses" on public.courses
  for select using (public.is_school_member(school_id));
create policy "admins and teachers add courses" on public.courses
  for insert with check (
    public.is_school_admin(school_id)
    or (public.has_school_role(school_id, '{teacher}') and created_by = auth.uid())
  );
create policy "admins and authors update courses" on public.courses
  for update using (public.is_school_admin(school_id) or created_by = auth.uid())
  with check (public.is_school_admin(school_id) or created_by = auth.uid());
create policy "admins and authors delete courses" on public.courses
  for delete using (public.is_school_admin(school_id) or created_by = auth.uid());

-- Sections: created through create_section(); read by anyone involved.
create policy "read visible sections" on public.sections
  for select using (public.can_view_section(id));
create policy "manage sections" on public.sections
  for update using (public.can_manage_section(id)) with check (public.can_manage_section(id));
create policy "admins delete sections" on public.sections
  for delete using (public.is_school_admin(school_id));

-- Enrollments: your own; the roster of sections you staff or administer;
-- your children's. Teachers may roster students into their own sections;
-- staff roles are assigned by admins.
create policy "read visible enrollments" on public.section_enrollments
  for select using (
    profile_id = auth.uid()
    or public.staffs_section(section_id)
    or public.is_school_admin(school_id)
    or public.is_guardian_of(profile_id)
  );
create policy "admins and teachers add enrollments" on public.section_enrollments
  for insert with check (
    public.is_school_admin(public.section_school(section_id))
    or (public.teaches_section(section_id) and role = 'student')
  );
create policy "admins and teachers update enrollments" on public.section_enrollments
  for update using (
    public.is_school_admin(school_id)
    or (public.teaches_section(section_id) and role = 'student')
  )
  with check (
    public.is_school_admin(school_id)
    or (public.teaches_section(section_id) and role = 'student')
  );
create policy "admins and teachers remove enrollments" on public.section_enrollments
  for delete using (
    public.is_school_admin(school_id)
    or (public.teaches_section(section_id) and role = 'student')
  );

-- Modules: staff see everything; students and guardians see what is published.
create policy "read visible modules" on public.modules
  for select using (
    public.can_manage_section(section_id)
    or public.staffs_section(section_id)
    or (published and public.can_view_section(section_id))
  );
create policy "manage modules" on public.modules
  for all using (public.can_manage_section(section_id))
  with check (public.can_manage_section(section_id));

-- Items: the body is behind can_access_item for students; browsing metadata
-- comes from the catalog view.
create policy "read accessible items" on public.module_items
  for select using (
    public.can_manage_section(public.item_section(id))
    or public.staffs_section(public.item_section(id))
    or public.can_access_item(id)
  );
create policy "manage items" on public.module_items
  for all using (
    exists (select 1 from public.modules m where m.id = module_id and public.can_manage_section(m.section_id))
  )
  with check (
    exists (select 1 from public.modules m where m.id = module_id and public.can_manage_section(m.section_id))
  );

-- Progress: a student records their own, and may complete anything they can
-- reach except a quiz, which only grading completes — in either direction.
create policy "read visible progress" on public.module_item_progress
  for select using (
    student_id = auth.uid()
    or public.is_guardian_of(student_id)
    or public.staffs_section(public.item_section(item_id))
    or public.is_school_admin(public.section_school(public.item_section(item_id)))
  );
create policy "students start and complete items" on public.module_item_progress
  for insert with check (
    student_id = auth.uid()
    and public.can_access_item(item_id)
    and (completed_at is null or not public.is_quiz_item(item_id))
  );
create policy "students update own progress" on public.module_item_progress
  for update using (
    student_id = auth.uid()
    and (completed_at is null or not public.is_quiz_item(item_id))
  )
  with check (
    student_id = auth.uid()
    and public.can_access_item(item_id)
    and (completed_at is null or not public.is_quiz_item(item_id))
  );

-- The answer key: section staff and admins author; no delete policy at all.
create policy "staff read questions" on public.quiz_questions
  for select using (public.can_manage_section(public.item_section(item_id)));
create policy "staff add questions" on public.quiz_questions
  for insert with check (public.can_manage_section(public.item_section(item_id)));
create policy "staff edit questions" on public.quiz_questions
  for update using (public.can_manage_section(public.item_section(item_id)))
  with check (public.can_manage_section(public.item_section(item_id)));

create policy "staff read options" on public.quiz_options
  for select using (
    exists (
      select 1 from public.quiz_questions q
      where q.id = question_id and public.can_manage_section(public.item_section(q.item_id))
    )
  );
create policy "staff add options" on public.quiz_options
  for insert with check (
    exists (
      select 1 from public.quiz_questions q
      where q.id = question_id and public.can_manage_section(public.item_section(q.item_id))
    )
  );
create policy "staff edit options" on public.quiz_options
  for update using (
    exists (
      select 1 from public.quiz_questions q
      where q.id = question_id and public.can_manage_section(public.item_section(q.item_id))
    )
  )
  with check (
    exists (
      select 1 from public.quiz_questions q
      where q.id = question_id and public.can_manage_section(public.item_section(q.item_id))
    )
  );

-- Attempts exist only because grading produced them: no INSERT or UPDATE policy.
create policy "read visible attempts" on public.quiz_attempts
  for select using (
    student_id = auth.uid()
    or public.is_guardian_of(student_id)
    or public.staffs_section(public.item_section(item_id))
    or public.is_school_admin(public.section_school(public.item_section(item_id)))
  );
create policy "read answers of visible attempts" on public.quiz_answers
  for select using (
    exists (
      select 1 from public.quiz_attempts a
      where a.id = attempt_id
        and (
          a.student_id = auth.uid()
          or public.is_guardian_of(a.student_id)
          or public.staffs_section(public.item_section(a.item_id))
          or public.is_school_admin(public.section_school(public.item_section(a.item_id)))
        )
    )
  );

create policy "read visible live sessions" on public.live_sessions
  for select using (public.can_view_section(section_id));
create policy "manage live sessions" on public.live_sessions
  for all using (public.can_manage_section(section_id))
  with check (public.can_manage_section(section_id));

create policy "read own notifications" on public.notifications
  for select using (user_id = auth.uid());
create policy "update own notifications" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
