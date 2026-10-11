-- Follows 20261012000000_weekly_notes.sql. Stops a paid model call from being made twice at once.
-- The weekly-note function used to check "is a note due?" and then write, so two requests arriving together (two
-- devices, a retry, a script in a loop) both saw "due" and both asked Claude. Now a request must first claim the
-- week, and only one claim succeeds per minute: everyone else gets the saved note back with no model call.
create table public.weekly_note_claims (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

-- Server only: no policies and no grants, so the phone can neither read nor write it.
alter table public.weekly_note_claims enable row level security;
revoke all on public.weekly_note_claims from anon, authenticated;

-- True for the one caller that may write the note now. Postgres locks the row while it changes it, so two calls at the
-- same moment cannot both win. A claim older than a minute can be taken again, so a call that crashed doesn't block the week.
create function public.claim_weekly_note(p_user_id uuid, p_week_start date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.weekly_note_claims as c (user_id, week_start, claimed_at)
  values (p_user_id, p_week_start, now())
  on conflict (user_id, week_start) do update
    set claimed_at = now()
    where c.claimed_at < now() - interval '60 seconds';
  -- FOUND is true when a row was inserted or updated, and false when the existing claim was too recent.
  return found;
end;
$$;

revoke execute on function public.claim_weekly_note(uuid, date) from public, anon, authenticated;
grant execute on function public.claim_weekly_note(uuid, date) to service_role;
