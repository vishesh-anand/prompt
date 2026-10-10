-- Follows 20261011000001_baseline_with_words.sql. A starting point also counts as empty when its processing failed for good and
-- it never got any measurements. A later first attempt that has words replaces it. A starting point still being processed,
-- or one with words, is never replaced.
create or replace function public.improve_baseline()
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
            and b.created_at < new.created_at
            and (
              (b.metrics is not null and (b.metrics ->> 'wordCount')::int = 0)
              or (b.metrics is null and b.status = 'failed')
            )
        );
  end if;
  return new;
end;
$$;

-- People whose starting point is already empty: move it to their earliest first attempt that has words.
update public.profiles p
  set baseline_answer_id = w.id
  from (
    select distinct on (user_id) id, user_id
    from public.answers
    where retry_of is null and (metrics ->> 'wordCount')::int > 0
    order by user_id, created_at
  ) w
  where p.id = w.user_id
    and p.baseline_answer_id is distinct from w.id
    and exists (
      select 1 from public.answers b
      where b.id = p.baseline_answer_id
        and (
          (b.metrics is not null and (b.metrics ->> 'wordCount')::int = 0)
          or (b.metrics is null and b.status = 'failed')
        )
    );
