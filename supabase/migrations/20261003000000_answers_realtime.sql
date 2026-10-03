-- Build step 4: let the phone hear about changes to an answer as the pipeline saves each stage.
-- Realtime still applies Row Level Security, so a person is only told about their own answers.
alter publication supabase_realtime add table public.answers;
