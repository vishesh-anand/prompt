-- Fixes 20261010000000_retry_of.sql: a policy that queries its own table is refused by Postgres
-- ("infinite recursion detected in policy"), which broke every answer insert.
-- The lookup moves into a function that runs as its owner and so skips the policy check.
-- It still only looks at the caller's own answers, and it returns only true or false.

create function public.is_my_first_attempt(attempt uuid, on_question bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.answers a
    where a.id = attempt
      and a.user_id = (select auth.uid())
      and a.question_id = on_question
      and a.retry_of is null
  );
$$;

revoke execute on function public.is_my_first_attempt(uuid, bigint) from public, anon;
grant execute on function public.is_my_first_attempt(uuid, bigint) to authenticated;

drop policy "Users add their own answers" on public.answers;

create policy "Users add their own answers"
  on public.answers for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      retry_of is null
      or public.is_my_first_attempt(retry_of, question_id)
    )
  );
