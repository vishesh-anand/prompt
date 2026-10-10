# FOLLOWUPS.md

Things we chose not to do yet, or could not check, so they don't get forgotten. Each says why and when to pick it up. Delete an item when it is done, and note it in the commit.

## Not checked yet

- **The real scheduled reminder.** The phone gets reminders (a 10-second test arrived), but the real one at the chosen time, on a day with no answer, has not been seen. Check the first morning or evening after a day you did not practice, and that none arrives on a day you did. *When:* during the beta's first days.
- **A real new signup through setup.** Setup has only run on the owner's account (cleared and repeated). Do it once with a second Apple Account before TestFlight. *When:* step 9, before TestFlight.
- **Flow 02 on every change that touches Done, Home or the record screen.** It records 3 real answers, so it counts against the 10 a day (see CLAUDE.md "Scripted end-to-end flows"). It passed on the final code. *When:* after any later change to navigation.

## Left for later

- **History is cut at 1000 rows.** `useHistory` loads every answer, and the server returns at most 1000. Past that, old first attempts vanish, so questions could repeat before all are seen. About 100 days at 10 a day, 1000 days at one a day, so the 4-week beta won't reach it. Fix with a bounded query plus a separate "question ids I have answered" query. *When:* before the beta runs past a few months, or when Progress (step 8) needs the full history anyway.
- **Validate the timezone name on the server and stop the phone changing it after setup.** Today the phone can write any text to `profiles.timezone`, and the daily limit uses it. The 24-hour cap (20 answers) bounds the cost, but the limit can reach twice the intended 10. *When:* step 9 (Settings), where changing timezone becomes a real decision.
- **The starting point has two rare edge cases** (`improve_baseline`, migrations `20261011000001` and `20261011000003`):
  - A starting point still being processed when a later first attempt is measured stays put, even if it later finishes with no words or fails. Nothing re-checks it.
  - A starting point that failed and was replaced is not restored if it is retried and succeeds, so the first-ever answer is lost as the starting point.
  *When:* if Progress (step 8) shows an empty or wrong starting point for anyone.
- **An answer kept on the phone because the upload failed does not count as practiced for the reminder.** The reminder can still arrive that day. `useReminders` only looks at uploaded answers. *When:* with the first report of a reminder arriving after an answer.
- **The record screen fetches its question by id, instead of using Home's cached list.** Adds a short wait, and retrying an answer to a switched-off question (only the owner's old placeholder answers) fails to load it. *When:* if the wait is noticeable on a real phone, or when old questions get switched off.
- **The Reminders debug screen holds a little logic in the screen file** (`app/dev/reminders.tsx`). It is dev and test builds only, so it was left. *When:* never, unless it grows.
- **Reminders are scheduled 30 notifications one after another.** If iOS suspends the app part-way, the phone can hold a partial set until the next open rebuilds it. *When:* if testers report missing reminders.
