-- Build step 5: the coach's notebook, and letting a person flag feedback as wrong.

-- coach_notebooks: a short private note per person, written by the pipeline with the server key.
-- The phone can only read its own row, which keeps it easy to inspect.
create table public.coach_notebooks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  notes text not null,
  updated_at timestamptz not null default now()
);

alter table public.coach_notebooks enable row level security;

create policy "Users read their own notebook"
  on public.coach_notebooks for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.coach_notebooks from anon, authenticated;
grant select on public.coach_notebooks to authenticated;

-- "This feedback is wrong": the phone may set one column on its own answers and nothing else.
-- The policy picks the rows, the column grant picks the column.
create policy "Users flag their own answers"
  on public.answers for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant update (feedback_flagged) on public.answers to authenticated;
