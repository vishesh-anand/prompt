-- Follows 20261012000004_save_resets_attempts.sql. The claim now also refuses when the saved note already covers the
-- days the caller would write it for, in the same statement that takes the claim. Before, a slow request could win a
-- claim, find the note already written, and walk away having used an attempt and locked the week for a few minutes
-- without anything having failed.
drop function public.claim_weekly_note(uuid, date, integer, integer);

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
  if p_days_covered is null or p_days_covered < 1 then
    raise exception 'claim_weekly_note: p_days_covered must be at least 1, got %', p_days_covered;
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

  insert into public.weekly_note_claims as c (user_id, week_start, claimed_at, attempts)
  values (p_user_id, p_week_start, now(), 1)
  on conflict (user_id, week_start) do update
    set claimed_at = now(), attempts = c.attempts + 1
    where c.claimed_at < now() - make_interval(secs => p_min_seconds)
      and c.attempts < p_max_attempts;
  return found;
end;
$$;

revoke execute on function public.claim_weekly_note(uuid, date, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_weekly_note(uuid, date, integer, integer, integer) to service_role;
