-- Follows 20261012000003_claim_attempts.sql. The attempts counter exists to stop a note that keeps failing from being
-- tried for ever. A note that was written is not a failure, so saving one starts the count again: only failures in a row
-- can use the week's attempts up, and a short outage can't lock a person out of their note for the rest of the week.
-- Same function as before, plus the reset (and only when the note was really written).
create or replace function public.save_weekly_note(
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

  -- FOUND is true only when the note was inserted or replaced.
  if found then
    update public.weekly_note_claims c set attempts = 0
      where c.user_id = p_user_id and c.week_start = p_week_start;
  end if;

  return query
    select n.text, n.days_covered from public.weekly_notes n
    where n.user_id = p_user_id and n.week_start = p_week_start;
end;
$$;

revoke execute on function public.save_weekly_note(uuid, date, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.save_weekly_note(uuid, date, text, integer, integer, text) to service_role;
