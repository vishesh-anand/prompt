-- Build step 7: first-time setup and the starting point.
-- 1. The phone may set its own reminder time and timezone, and nothing else on the profile.
-- 2. The first recording becomes the starting point (baseline_answer_id), set by the database, never by the phone.

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant update (reminder_time, timezone) on public.profiles to authenticated;

-- The first attempt a person ever records is their starting point. A retry never is, and a later first attempt
-- never replaces it. The update only matches while baseline_answer_id is null, and Postgres locks the row while
-- it changes it, so two answers saved at once still leave exactly one baseline.
create function public.set_baseline_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.retry_of is null then
    update public.profiles
      set baseline_answer_id = new.id
      where id = new.user_id and baseline_answer_id is null;
  end if;
  return new;
end;
$$;

revoke execute on function public.set_baseline_answer() from public, anon, authenticated;

create trigger on_answer_created
  after insert on public.answers
  for each row execute function public.set_baseline_answer();

-- People who already answered before this step: their earliest first attempt is their starting point.
update public.profiles p
  set baseline_answer_id = first_try.id
  from (
    select distinct on (user_id) id, user_id
    from public.answers
    where retry_of is null
    order by user_id, created_at
  ) first_try
  where p.id = first_try.user_id and p.baseline_answer_id is null;
