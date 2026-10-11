-- Follows 20261012000005_claim_covers_days.sql. Two changes to claim_weekly_note:
-- 1. A week's failed attempts used to count for the whole week, so an outage of a day could use all 20 and lock the first
--    note of the week for good. Attempts now start over after 6 hours without an attempt, so a model that is healthy
--    again gets used. The cost stays capped: at most 20 attempts in any 6 hours.
-- 2. The days are checked against the same 3 to 7 as the table, so a caller bug can't win a claim, pay for a model call
--    and then fail on save.
drop function public.claim_weekly_note(uuid, date, integer, integer, integer);

create function public.claim_weekly_note(
  p_user_id uuid,
  p_week_start date,
  p_min_seconds integer,
  p_max_attempts integer,
  p_days_covered integer
)
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
  if p_days_covered is null or p_days_covered < 3 or p_days_covered > 7 then
    raise exception 'claim_weekly_note: p_days_covered must be between 3 and 7, got %', p_days_covered;
  end if;

  -- A note that already covers these days needs nothing: no claim, no attempt.
  if exists (
    select 1 from public.weekly_notes n
    where n.user_id = p_user_id and n.week_start = p_week_start and n.days_covered >= p_days_covered
  ) then
    return false;
  end if;

  delete from public.weekly_note_claims
    where user_id = p_user_id and week_start < p_week_start - 14;

  -- One attempt at a time (the minimum gap); no more than p_max_attempts in a row; and a count that has been left alone
  -- for 6 hours starts again.
  insert into public.weekly_note_claims as c (user_id, week_start, claimed_at, attempts)
  values (p_user_id, p_week_start, now(), 1)
  on conflict (user_id, week_start) do update
    set claimed_at = now(),
        attempts = case when c.claimed_at < now() - interval '6 hours' then 1 else c.attempts + 1 end
    where c.claimed_at < now() - make_interval(secs => p_min_seconds)
      and (c.attempts < p_max_attempts or c.claimed_at < now() - interval '6 hours');
  return found;
end;
$$;

revoke execute on function public.claim_weekly_note(uuid, date, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_weekly_note(uuid, date, integer, integer, integer) to service_role;
