-- Build step 8: the weekly coach note.
-- One note per person per week, written by the weekly-note function with the server key. The phone can only read its own.
-- The note is first written on the third practice day of the week and rewritten on each new practice day after that,
-- so days_covered says how many practice days the saved text was written from.
create table public.weekly_notes (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The Monday of the week, in the person's own timezone.
  week_start date not null,
  text text not null,
  days_covered integer not null check (days_covered between 3 and 7),
  prompt_version integer not null,
  model text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.weekly_notes enable row level security;

create policy "Users read their own weekly notes"
  on public.weekly_notes for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.weekly_notes from anon, authenticated;
grant select on public.weekly_notes to authenticated;

-- Writes a note only if it covers more practice days than the one already saved, and returns the note that is saved
-- afterwards. Two phones opening Progress at once, or a slow call finishing after a faster one, can never move a
-- note backwards. Only the server key can run it.
create function public.save_weekly_note(
  p_user_id uuid,
  p_week_start date,
  p_text text,
  p_days_covered integer,
  p_prompt_version integer,
  p_model text
)
returns table (text text, days_covered integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.weekly_notes as w (user_id, week_start, text, days_covered, prompt_version, model)
  values (p_user_id, p_week_start, p_text, p_days_covered, p_prompt_version, p_model)
  on conflict (user_id, week_start) do update
    set text = excluded.text,
        days_covered = excluded.days_covered,
        prompt_version = excluded.prompt_version,
        model = excluded.model,
        updated_at = now()
    where excluded.days_covered > w.days_covered;

  return query
    select n.text, n.days_covered from public.weekly_notes n
    where n.user_id = p_user_id and n.week_start = p_week_start;
end;
$$;

revoke execute on function public.save_weekly_note(uuid, date, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.save_weekly_note(uuid, date, text, integer, integer, text) to service_role;
