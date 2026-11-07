-- Build step D, part 2: "That's what I meant" / "Not quite" under what the AI listener understood.
-- true = that's what I meant, false = not quite, null = not tapped (or tapped again to undo). Progress counts it in step F.
alter table public.answers add column listener_confirmed boolean null;

-- Like "This feedback is wrong": the phone may set this one column on its own answers. The existing policy
-- "Users flag their own answers" picks the rows (only your own); this grant adds the column.
grant update (listener_confirmed) on public.answers to authenticated;
