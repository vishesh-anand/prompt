-- Checks the listener check's database rules: friends' ratings and the eval clips are for the server key only. Run with:
--   npx supabase db query --linked -f supabase/tests/listener.sql
-- One block that always ends in an exception, so Postgres undoes everything it did.
-- Success is an error whose message starts with LISTENER_CHECKS_PASSED. Anything starting with FAIL names the broken case.
do $$
declare
  ann uuid := gen_random_uuid();
  n integer;
begin
  insert into auth.users (id) values (ann);
  insert into public.listener_ratings (rater, clip, point, effort, has_support, clear_ending, would_cut)
  values ('R9', 'c99', 'A test point.', 3, true, false, false);
  insert into storage.objects (bucket_id, name) values ('eval-clips', 'c99.m4a');

  -- (a) The bucket is private.
  if (select public from storage.buckets where id = 'eval-clips') is distinct from false then
    raise exception 'FAIL (a): eval-clips is not private';
  end if;

  -- (b) A signed-in person sees no ratings and no eval clips.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ann, 'role', 'authenticated')::text, true);
  select count(*) into n from public.listener_ratings;
  if n <> 0 then raise exception 'FAIL (b1): a signed-in person can read % ratings', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'eval-clips';
  if n <> 0 then raise exception 'FAIL (b2): a signed-in person can see % eval clips', n; end if;

  -- (c) A signed-in person can't write a rating.
  begin
    insert into public.listener_ratings (rater, clip, point, effort, has_support, clear_ending, would_cut)
    values ('R1', 'c01', 'Sneaky.', 1, true, true, true);
    raise exception 'FAIL (c): a signed-in person wrote a rating';
  exception when insufficient_privilege then null;
  end;

  -- (d) Signed out: nothing either.
  reset role;
  set local role anon;
  select count(*) into n from public.listener_ratings;
  if n <> 0 then raise exception 'FAIL (d1): signed out can read % ratings', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'eval-clips';
  if n <> 0 then raise exception 'FAIL (d2): signed out can see % eval clips', n; end if;
  begin
    insert into public.listener_ratings (rater, clip, point, effort, has_support, clear_ending, would_cut)
    values ('R1', 'c01', 'Sneaky.', 1, true, true, true);
    raise exception 'FAIL (d3): signed out wrote a rating';
  exception when insufficient_privilege then null;
  end;

  reset role;
  raise exception 'LISTENER_CHECKS_PASSED';
end $$;
