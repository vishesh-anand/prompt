-- Build step 3: profiles, questions, answers, and the private recordings bucket.
-- Every table has Row Level Security. The phone's role also gets only the column
-- permissions it needs, because RLS decides which rows and grants decide which columns.

-- questions: shared content with no owner, so signed-in users can read, nobody can write.
create table public.questions (
  id bigint generated always as identity primary key,
  category text not null check (category in ('work', 'everyday')),
  text text not null,
  active boolean not null default true
);

-- answers: the phone sets only id, question_id and duration_ms. Everything else is set by
-- defaults or, from step 4, by the pipeline using the server key.
create table public.answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id bigint not null references public.questions (id),
  created_at timestamptz not null default now(),
  retry_of uuid references public.answers (id),
  -- Generated, so a row can never point at someone else's file.
  audio_path text generated always as (user_id::text || '/' || id::text || '.m4a') stored,
  duration_ms integer not null check (duration_ms > 0 and duration_ms <= 65000),
  audio_deleted_at timestamptz,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'transcribed', 'measured', 'judged', 'coached', 'failed')),
  transcript jsonb,
  metrics jsonb,
  judgement jsonb,
  coaching jsonb,
  pipeline_version jsonb,
  feedback_flagged boolean not null default false
);

create index answers_user_created_idx on public.answers (user_id, created_at desc);
create index answers_question_idx on public.answers (question_id);
create index answers_retry_of_idx on public.answers (retry_of);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  reminder_time time,
  timezone text,
  baseline_answer_id uuid references public.answers (id) on delete set null,
  consent_to_improve boolean not null default false,
  created_at timestamptz not null default now()
);

create index profiles_baseline_answer_idx on public.profiles (baseline_answer_id);

-- A profile row appears when someone first signs in. Kept trivial: if this throws, sign-in fails.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.profiles enable row level security;

create policy "Signed-in users read active questions"
  on public.questions for select to authenticated
  using (active);

create policy "Users read their own answers"
  on public.answers for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users add their own answers"
  on public.answers for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- Column and table permissions. Supabase grants everything by default, so take it away first.
revoke all on public.questions, public.answers, public.profiles from anon, authenticated;

grant select on public.questions to authenticated;
grant select on public.profiles to authenticated;
grant select on public.answers to authenticated;
-- retry_of is added to this list in step 6, with a check that it points at the user's own answer.
grant insert (id, question_id, duration_ms) on public.answers to authenticated;

-- Placeholder questions until the real ~100 arrive (step 7 deactivates these in a new migration).
insert into public.questions (category, text) values
  ('work', 'Tell me about a time you had to explain something complicated to someone.'),
  ('work', 'Describe a decision you made at work that you would make differently now.'),
  ('work', 'What is a project you are proud of, and why?'),
  ('everyday', 'Tell me about a place you would take a visitor to your town.'),
  ('everyday', 'What is something you changed your mind about recently?');

-- Recordings: private bucket, one folder per user, m4a audio only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 10485760, array['audio/mp4']);

create policy "Users upload to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users read their own recordings"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
