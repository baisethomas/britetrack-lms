-- Minimal stand-in for the parts of a Supabase database that the migration
-- depends on. Applied BEFORE supabase/migrations/*.sql so RLS policies behave
-- the way they do in a real project.

-- API roles. `authenticated` and `anon` are deliberately unprivileged: they
-- own nothing and cannot bypass RLS, which is what makes the policy tests
-- meaningful.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

-- Supabase's user table, reduced to the columns the migration reads.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- PostgREST exposes the JWT as the `request.jwt.claims` GUC; auth.uid() reads
-- the subject from it. Tests set that GUC to impersonate a user.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants table privileges to the API roles and relies on RLS for
-- row-level authorization; mirror that for tables created after this point.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
