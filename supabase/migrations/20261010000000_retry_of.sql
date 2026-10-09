-- Build step 6: the phone may set retry_of when it adds an answer.
-- A retry must point at the user's own first attempt on the same question, so retry_of
-- always names the first attempt and never a retry or someone else's answer.
-- Outer columns carry the answers. prefix: a bare retry_of inside the subquery would mean a.retry_of.

grant insert (retry_of) on public.answers to authenticated;

drop policy "Users add their own answers" on public.answers;

create policy "Users add their own answers"
  on public.answers for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      answers.retry_of is null
      or exists (
        select 1 from public.answers a
        where a.id = answers.retry_of
          and a.user_id = (select auth.uid())
          and a.question_id = answers.question_id
          and a.retry_of is null
      )
    )
  );
