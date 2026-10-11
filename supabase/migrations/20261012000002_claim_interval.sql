-- Follows 20261012000001_weekly_note_claim.sql. Two changes to claim_weekly_note:
-- 1. The "one attempt per minute" bound is now passed in by the function that owns the rule (and checked here), instead
--    of being a number hidden inside SQL.
-- 2. Old claims are removed as new ones are written, so the table never grows past a few rows per person.
drop function public.claim_weekly_note(uuid, date);

create function public.claim_weekly_note(p_user_id uuid, p_week_start date, p_min_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A bound of nothing, or of hours, is a mistake in the caller, not a rule.
  if p_min_seconds is null or p_min_seconds < 10 or p_min_seconds > 3600 then
    raise exception 'claim_weekly_note: p_min_seconds must be between 10 and 3600, got %', p_min_seconds;
  end if;

  -- Only this person's claims from weeks that are over matter no more.
  delete from public.weekly_note_claims
    where user_id = p_user_id and week_start < p_week_start - 14;

  insert into public.weekly_note_claims as c (user_id, week_start, claimed_at)
  values (p_user_id, p_week_start, now())
  on conflict (user_id, week_start) do update
    set claimed_at = now()
    where c.claimed_at < now() - make_interval(secs => p_min_seconds);
  -- FOUND is true when a row was inserted or updated, and false when the existing claim was too recent.
  return found;
end;
$$;

revoke execute on function public.claim_weekly_note(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.claim_weekly_note(uuid, date, integer) to service_role;
