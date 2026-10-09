-- Checks who may set answers.retry_of. Run with:
--   npx supabase db query --linked -f supabase/tests/retry_of.sql
-- It is one block that always ends in an exception, so Postgres undoes everything it did.
-- Success looks like an error whose message starts with RETRY_OF_CHECKS_PASSED.
-- Any other message names the case that failed, starting with FAIL.
do $$
declare
  ann uuid := gen_random_uuid();
  ben uuid := gen_random_uuid();
  first_try uuid := gen_random_uuid();
  retry uuid := gen_random_uuid();
begin
  insert into auth.users (id) values (ann), (ben);
  set local role authenticated;

  -- Acts as Ann.
  perform set_config('request.jwt.claims', json_build_object('sub', ann, 'role', 'authenticated')::text, true);

  -- (a) A first attempt is fine.
  insert into public.answers (id, question_id, duration_ms) values (first_try, 1, 20000);

  -- (b) A retry of her own first attempt, same question, is fine.
  begin
    insert into public.answers (id, question_id, duration_ms, retry_of) values (retry, 1, 20000, first_try);
  exception when others then
    raise exception 'FAIL (b): own retry was refused: % %', sqlstate, sqlerrm;
  end;

  -- (d) A retry on a different question is refused by the row rule.
  begin
    insert into public.answers (question_id, duration_ms, retry_of) values (2, 20000, first_try);
    raise exception 'FAIL (d): retry on a different question was allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' or sqlerrm not like '%row-level security%' then
      raise exception 'FAIL (d): wrong error: % %', sqlstate, sqlerrm;
    end if;
  end;

  -- (e) A retry of a retry is refused: retry_of always points at the first attempt.
  begin
    insert into public.answers (question_id, duration_ms, retry_of) values (1, 20000, retry);
    raise exception 'FAIL (e): retry of a retry was allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' or sqlerrm not like '%row-level security%' then
      raise exception 'FAIL (e): wrong error: % %', sqlstate, sqlerrm;
    end if;
  end;

  -- (f) retry_of can be set when a row is added, never changed afterwards.
  begin
    update public.answers set retry_of = first_try where id = first_try;
    raise exception 'FAIL (f): retry_of was updated';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then
      raise exception 'FAIL (f): wrong error: % %', sqlstate, sqlerrm;
    end if;
  end;

  -- Acts as Ben.
  perform set_config('request.jwt.claims', json_build_object('sub', ben, 'role', 'authenticated')::text, true);

  -- (c) A retry that points at someone else's answer is refused.
  begin
    insert into public.answers (question_id, duration_ms, retry_of) values (1, 20000, first_try);
    raise exception 'FAIL (c): retry of another user''s answer was allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' or sqlerrm not like '%row-level security%' then
      raise exception 'FAIL (c): wrong error: % %', sqlstate, sqlerrm;
    end if;
  end;

  raise exception 'RETRY_OF_CHECKS_PASSED';
end $$;
