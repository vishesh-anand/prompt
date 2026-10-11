-- Follows 20261012000002_claim_interval.sql. A note that keeps failing (the model refuses, or always writes too much)
-- used to be tried again every minute with no end. Each week now has a limited number of attempts, counted on the claim,
-- so the cost of one bad week is capped. A new week starts with a fresh count.
alter table public.weekly_note_claims add column attempts integer not null default 1;

drop function public.claim_weekly_note(uuid, date, integer);

create function public.claim_weekly_note(p_user_id uuid, p_week_start date, p_min_seconds integer, p_max_attempts integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_min_seconds is null or p_min_seconds < 10 or p_min_seconds > 3600 then
    raise exception 'claim_weekly_note: p_min_seconds must be between 10 and 3600, got %', p_min_seconds;
  end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 100 then
    raise exception 'claim_weekly_note: p_max_attempts must be between 1 and 100, got %', p_max_attempts;
  end if;

  delete from public.weekly_note_claims
    where user_id = p_user_id and week_start < p_week_start - 14;

  -- One attempt at a time (the minimum gap), and no more than p_max_attempts in the week.
  insert into public.weekly_note_claims as c (user_id, week_start, claimed_at, attempts)
  values (p_user_id, p_week_start, now(), 1)
  on conflict (user_id, week_start) do update
    set claimed_at = now(), attempts = c.attempts + 1
    where c.claimed_at < now() - make_interval(secs => p_min_seconds)
      and c.attempts < p_max_attempts;
  return found;
end;
$$;

revoke execute on function public.claim_weekly_note(uuid, date, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_weekly_note(uuid, date, integer, integer) to service_role;
