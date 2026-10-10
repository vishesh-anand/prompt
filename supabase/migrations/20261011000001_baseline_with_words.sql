-- Fixes a gap in 20261011000000_profile_setup.sql: the first recording became the starting point even when nothing could be
-- heard in it (a covered mic, a failed take). Progress would then compare against an empty answer forever.
-- Now, once a later first attempt is measured and has words, it replaces a starting point that was measured and had none.
-- A starting point that is still being processed, failed, or has words is never replaced.
create function public.improve_baseline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.retry_of is null and coalesce((new.metrics ->> 'wordCount')::int, 0) > 0 then
    update public.profiles p
      set baseline_answer_id = new.id
      where p.id = new.user_id
        and p.baseline_answer_id is distinct from new.id
        and exists (
          select 1 from public.answers b
          where b.id = p.baseline_answer_id
            and b.metrics is not null
            and (b.metrics ->> 'wordCount')::int = 0
            and b.created_at < new.created_at
        );
  end if;
  return new;
end;
$$;

revoke execute on function public.improve_baseline() from public, anon, authenticated;

create trigger on_answer_measured
  after update of metrics on public.answers
  for each row
  when (new.metrics is distinct from old.metrics)
  execute function public.improve_baseline();
