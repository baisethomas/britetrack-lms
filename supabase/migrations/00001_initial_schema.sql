-- BriteTrack LMS — initial schema
-- Roles: admin (manages content + users), student (learns), parent (observes linked students).
-- All access control is enforced here with RLS; the Next.js app talks to Supabase
-- directly with the anon key and the user's session.

create type public.user_role as enum ('admin', 'student', 'parent');
create type public.course_status as enum ('draft', 'published', 'archived');
create type public.lesson_content_type as enum ('video', 'article', 'quiz', 'live_session');
create type public.notification_type as enum ('enrollment', 'lesson_unlocked', 'live_session', 'announcement', 'progress');

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user, created by trigger)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'student',
  full_name text not null default '',
  avatar_url text,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Signup metadata is client-controlled: only self-service roles are honored.
  -- Admins are promoted explicitly by an existing admin (or via SQL bootstrap).
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case
      when new.raw_user_meta_data ->> 'role' in ('student', 'parent')
        then (new.raw_user_meta_data ->> 'role')::public.user_role
      else 'student'
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: current user's role, usable inside RLS policies without recursion.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Parent ↔ student links
-- ---------------------------------------------------------------------------
create table public.parent_student_links (
  parent_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);

-- ---------------------------------------------------------------------------
-- Courses and lessons
-- ---------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  cover_url text,
  category text,
  status public.course_status not null default 'draft',
  sequential_unlock boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  summary text not null default '',
  content_type public.lesson_content_type not null default 'article',
  content text not null default '',
  video_url text,
  duration_minutes int not null default 0 check (duration_minutes >= 0),
  position int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, position)
);

create index lessons_course_idx on public.lessons (course_id, position);

-- ---------------------------------------------------------------------------
-- Enrollments and progress
-- ---------------------------------------------------------------------------
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (course_id, student_id)
);

create index enrollments_student_idx on public.enrollments (student_id);

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (lesson_id, student_id)
);

create index lesson_progress_student_idx on public.lesson_progress (student_id, completed_at);

-- ---------------------------------------------------------------------------
-- Live sessions (Zoom)
-- ---------------------------------------------------------------------------
create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  duration_minutes int not null default 60,
  zoom_meeting_id text,
  join_url text,
  recording_url text,
  created_at timestamptz not null default now()
);

create index live_sessions_course_idx on public.live_sessions (course_id, starts_at);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
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

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Lesson access control
-- ---------------------------------------------------------------------------
-- True when the caller may record progress on a lesson: they must be enrolled
-- in the lesson's published course, and for sequential courses every earlier
-- lesson must already be completed. Used by lesson_progress RLS so sequencing
-- is enforced by the database, not just the UI.
create or replace function public.can_access_lesson(p_lesson_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.lessons l
    join public.courses c on c.id = l.course_id
    join public.enrollments e
      on e.course_id = c.id and e.student_id = auth.uid()
    where l.id = p_lesson_id
      and c.status = 'published'
      and (
        not c.sequential_unlock
        or not exists (
          select 1
          from public.lessons prev
          where prev.course_id = l.course_id
            and prev.position < l.position
            and not exists (
              select 1
              from public.lesson_progress lp
              where lp.lesson_id = prev.id
                and lp.student_id = auth.uid()
                and lp.completed_at is not null
            )
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Enrollment completion is derived, never written by students
-- ---------------------------------------------------------------------------
-- Stamps enrollments.completed_at when every lesson of the course is complete,
-- and clears it again if progress is removed.
create or replace function public.sync_enrollment_completion()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_course_id uuid;
  v_student_id uuid;
  v_all_done boolean;
begin
  select l.course_id into v_course_id
  from public.lessons l
  where l.id = coalesce(new.lesson_id, old.lesson_id);
  v_student_id := coalesce(new.student_id, old.student_id);
  if v_course_id is null then
    return coalesce(new, old);
  end if;

  select not exists (
    select 1
    from public.lessons l
    where l.course_id = v_course_id
      and not exists (
        select 1
        from public.lesson_progress lp
        where lp.lesson_id = l.id
          and lp.student_id = v_student_id
          and lp.completed_at is not null
      )
  ) into v_all_done;

  update public.enrollments
  set completed_at = case when v_all_done then coalesce(completed_at, now()) end
  where course_id = v_course_id and student_id = v_student_id;

  return coalesce(new, old);
end;
$$;

create trigger lesson_progress_sync_completion
  after insert or update or delete on public.lesson_progress
  for each row execute function public.sync_enrollment_completion();

-- A newly added lesson makes previously "completed" enrollments incomplete.
create or replace function public.reset_completion_on_new_lesson()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.enrollments
  set completed_at = null
  where course_id = new.course_id and completed_at is not null;
  return new;
end;
$$;

create trigger lessons_reset_completion
  after insert on public.lessons
  for each row execute function public.reset_completion_on_new_lesson();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.parent_student_links enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.live_sessions enable row level security;
alter table public.notifications enable row level security;

-- Profiles
create policy "read own profile" on public.profiles
  for select using (id = auth.uid());
create policy "admins read all profiles" on public.profiles
  for select using (public.current_user_role() = 'admin');
create policy "parents read linked students" on public.profiles
  for select using (
    exists (
      select 1 from public.parent_student_links l
      where l.parent_id = auth.uid() and l.student_id = profiles.id
    )
  );
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));
create policy "admins update profiles" on public.profiles
  for update using (public.current_user_role() = 'admin');

-- Parent/student links: admins manage, parents and students see their own
create policy "read own links" on public.parent_student_links
  for select using (parent_id = auth.uid() or student_id = auth.uid());
create policy "admins manage links" on public.parent_student_links
  for all using (public.current_user_role() = 'admin');

-- Courses: published courses are visible to signed-in users; admins see and manage all
create policy "read published courses" on public.courses
  for select using (status = 'published' and auth.uid() is not null);
create policy "admins manage courses" on public.courses
  for all using (public.current_user_role() = 'admin');

-- Lesson content (body, video URL) is only readable when the caller may
-- actually take the lesson — enrolled and, for sequential courses, unlocked.
-- Browsing metadata comes from the lesson_catalog view below instead.
create policy "students read accessible lessons" on public.lessons
  for select using (public.can_access_lesson(id));
create policy "parents read lessons of linked enrollments" on public.lessons
  for select using (
    exists (
      select 1
      from public.enrollments e
      join public.parent_student_links l on l.student_id = e.student_id
      where e.course_id = lessons.course_id and l.parent_id = auth.uid()
    )
  );
create policy "admins manage lessons" on public.lessons
  for all using (public.current_user_role() = 'admin');

-- Enrollments: students self-enroll in published courses and read their own;
-- parents read linked students'; admins manage all
create policy "students read own enrollments" on public.enrollments
  for select using (student_id = auth.uid());
create policy "parents read linked enrollments" on public.enrollments
  for select using (
    exists (
      select 1 from public.parent_student_links l
      where l.parent_id = auth.uid() and l.student_id = enrollments.student_id
    )
  );
create policy "students self-enroll" on public.enrollments
  for insert with check (
    student_id = auth.uid()
    and public.current_user_role() = 'student'
    and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published')
  );
-- No student UPDATE policy on enrollments: completed_at is derived by the
-- sync_enrollment_completion trigger, never written by clients.
create policy "admins manage enrollments" on public.enrollments
  for all using (public.current_user_role() = 'admin');

-- Lesson progress: mirrors enrollments
create policy "students read own progress" on public.lesson_progress
  for select using (student_id = auth.uid());
create policy "parents read linked progress" on public.lesson_progress
  for select using (
    exists (
      select 1 from public.parent_student_links l
      where l.parent_id = auth.uid() and l.student_id = lesson_progress.student_id
    )
  );
create policy "students write own progress" on public.lesson_progress
  for insert with check (
    student_id = auth.uid() and public.can_access_lesson(lesson_id)
  );
create policy "students update own progress" on public.lesson_progress
  for update using (student_id = auth.uid())
  with check (student_id = auth.uid() and public.can_access_lesson(lesson_id));
create policy "admins read progress" on public.lesson_progress
  for select using (public.current_user_role() = 'admin');

-- Live sessions carry Zoom join/recording URLs: enrolled students and
-- linked parents only, not everyone who can browse the course.
create policy "students read sessions of enrolled courses" on public.live_sessions
  for select using (
    exists (
      select 1 from public.enrollments e
      where e.course_id = live_sessions.course_id and e.student_id = auth.uid()
    )
  );
create policy "parents read sessions of linked enrollments" on public.live_sessions
  for select using (
    exists (
      select 1
      from public.enrollments e
      join public.parent_student_links l on l.student_id = e.student_id
      where e.course_id = live_sessions.course_id and l.parent_id = auth.uid()
    )
  );
create policy "admins manage live sessions" on public.live_sessions
  for all using (public.current_user_role() = 'admin');

-- Notifications: owner-only reads/updates; inserts come from service role or admins
create policy "read own notifications" on public.notifications
  for select using (user_id = auth.uid());
create policy "update own notifications" on public.notifications
  for update using (user_id = auth.uid());
create policy "admins insert notifications" on public.notifications
  for insert with check (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Lesson catalog view (safe browsing metadata, no content)
-- ---------------------------------------------------------------------------
-- Owner-rights view: exposes only non-sensitive columns of lessons in
-- published courses so signed-in users can browse curricula before enrolling.
create view public.lesson_catalog as
  select l.id, l.course_id, l.title, l.summary, l.content_type,
         l.duration_minutes, l.position
  from public.lessons l
  join public.courses c on c.id = l.course_id
  where c.status = 'published';

revoke all on public.lesson_catalog from anon;
grant select on public.lesson_catalog to authenticated;

-- ---------------------------------------------------------------------------
-- Admin helpers
-- ---------------------------------------------------------------------------
-- Resolve student emails to profile ids for bulk enrollment. Emails live in
-- auth.users, which the API roles cannot read, so this runs security definer
-- and refuses non-admin callers.
create or replace function public.find_students_by_email(emails text[])
returns table (id uuid, email text)
language plpgsql
security definer set search_path = public
as $$
begin
  -- NULL-safe: anonymous callers and users without profiles are refused too.
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'forbidden';
  end if;
  return query
    select p.id, u.email::text
    from auth.users u
    join public.profiles p on p.id = u.id
    where lower(u.email) = any (emails) and p.role = 'student';
end;
$$;

-- Admin user directory with emails (same admin-only guard).
create or replace function public.admin_list_users()
returns table (id uuid, email text, full_name text, role public.user_role, created_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'forbidden';
  end if;
  return query
    select p.id, u.email::text, p.full_name, p.role, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger courses_updated_at before update on public.courses
  for each row execute function public.set_updated_at();
create trigger lessons_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();
