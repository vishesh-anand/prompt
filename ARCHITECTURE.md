# ARCHITECTURE.md

How the app is built behind the screens. Read PRODUCT.md (what it does) and DESIGN.md (how it looks) first.

## The big picture

The iPhone app is the dining room. Supabase is the kitchen. The AI providers are suppliers the kitchen calls. **The app never talks to an AI provider directly, and never holds an API key.**

```
iPhone app (Expo)
  │ 1. record audio
  │ 2. upload audio to Supabase Storage
  │ 3. create an "answer" row, call process-answer
  │ 4. listen to that row; show each result as it appears
  ▼
Supabase
  ├─ Auth        Sign in with Apple
  ├─ Storage     recordings (private)
  ├─ Postgres    answers, scores, coach notebook, questions
  └─ Edge function: process-answer
        Transcribe → Measure → Map → Coach → Update notebook
        (writes results to the answer row after each stage)
```

## Decisions

| Decision | Choice | Why |
|---|---|---|
| App | Expo + TypeScript, iOS first | Readable for us, native feel via @expo/ui, Android later |
| Backend | Supabase | Database, storage, auth, and server code in one place |
| Map and coach AI | Claude, behind a swappable interface | Best at strict rubrics and a consistent tone |
| What the feedback looks at | Whether a listener gets the point, and how much effort it costs them | Backed by two research reports: `reports/Proven ways to speak articulately.md` and `reports/Listener clarity and effort in speech.md` (notes in `research_notes/`) |
| Voice to text | ElevenLabs Scribe v2, chosen by a test (`evals/results/transcribers.md`) | Caught every um and uh in our recordings, repeatably, and is fast and cheap |
| Feedback delivery | In stages, as each part finishes | Numbers in seconds, AI parts shortly after |
| Audio retention | 30 days, plus the first recording forever | Replay and day-one comparison without hoarding voices |
| Coach memory | A short "coach's notebook" per user | Most of the value, easy to inspect and test |
| Reminders | Local notifications on the phone | No server needed, cancelled once you practice |

## Tech stack

**App**
- Expo (latest SDK), TypeScript in strict mode
- Expo Router for screens (file-based, like Next.js)
- `@expo/ui` SwiftUI components for all standard UI. One exception: the Sign in with Apple button is Apple's own native button from `expo-apple-authentication`, because Apple requires it.
- Reanimated for all animation (runs on the UI thread)
- `react-native-svg` for the thin progress ring around the recording circle (Reanimated animates it)
- Skia only if Reanimated can't achieve the recording circle
- `expo-audio` for recording (with live loudness for the circle) and playback
- `expo-apple-authentication`, `expo-haptics`, `expo-notifications`
- `@supabase/supabase-js` for data and live updates
- TanStack Query for loading and caching server data. No Redux or other global store.
- Zod for checking the shape of all data coming from the server

**Backend**
- Supabase Postgres, Auth, Storage, Realtime
- Edge functions in TypeScript (Deno)
- Anthropic API for map, coach, notebook, and coach's note
- Voice-to-text provider: ElevenLabs Scribe v2 (see Decisions)

## Folder structure

```
/
├─ PRODUCT.md  DESIGN.md  ARCHITECTURE.md  CLAUDE.md
├─ app/                      Expo app
│  ├─ app/                   screens (Expo Router)
│  │  ├─ (auth)/sign-in.tsx
│  │  ├─ (onboarding)/reminder.tsx
│  │  ├─ (tabs)/index.tsx    home
│  │  ├─ (tabs)/progress.tsx
│  │  ├─ (tabs)/settings.tsx
│  │  ├─ record.tsx
│  │  ├─ feedback/[answerId].tsx
│  │  └─ compare/[answerId].tsx
│  ├─ src/
│  │  ├─ design/             color, type, spacing tokens + core components
│  │  ├─ features/           one folder per feature: recording, feedback, progress, reminders
│  │  ├─ lib/                supabase client, schemas, helpers
│  │  └─ hooks/
├─ supabase/
│  ├─ migrations/            database changes, in order
│  ├─ seed/                  questions
│  └─ functions/
│     ├─ process-answer/     runs the pipeline
│     ├─ weekly-note/
│     ├─ delete-account/
│     └─ _shared/
│        ├─ pipeline/        one file per stage
│        ├─ providers/       transcriber and AI model interfaces + implementations
│        ├─ prompts/         prompt files, each with a version number
│        └─ schemas/         shapes of every stage's output
├─ content/questions.json    the ~100 hand-written questions
└─ evals/                    test recordings, labels, and the scoring script
```

Rule: a screen file only arranges things on screen. Logic lives in `src/features/`.

## Data

All tables use Row Level Security: a person can only ever read or change their own rows. The one exception is **questions**: it has no owner, so it is read-only for every signed-in person (only active questions, no writes from the app). Signed-out visitors can read nothing.

**profiles**
- `id` (same as the auth user), `reminder_time`, `timezone`
- `baseline_answer_id` (the first recording, kept forever)
- `consent_to_improve` (yes/no: can their recordings be used to test the feedback)
- `created_at`

**questions**
- `id`, `category` (`work` or `everyday`), `text`, `active`

**answers**
- `id`, `user_id`, `question_id`, `created_at`
- `retry_of` (points to the first attempt when this is a retry)
- `audio_path`, `duration_ms` (up to the answer's limit, with a few seconds of margin), `audio_deleted_at`
- `time_limit_ms` (the limit it was recorded with: 2 minutes on a first try, 90 seconds on a retry, 60 seconds before step B; the "time ran out" rule uses it)
- `status`: `uploaded` → `transcribed` → `measured` → `mapped` → `coached`, or `failed`
- `transcript` (words with start and end times)
- `metrics` (counted by code: fillers and which ones, fillers a minute, pace, pauses and whether each fell mid-sentence or between sentences, repeats, hedges, vague words, "and" chaining)
- `map` (the answer's steps with labels and times, the point, the listener's restatement, "what I didn't follow", restarts, and the moments a listener would notice; every item quotes real words)
- `coaching` (one tip, better version, the better version's steps, the "what changed" line)
- `pipeline_version` (which prompts and models produced this, for comparisons)
- `feedback_flagged` ("This feedback is wrong" was pressed)
- `listener_confirmed` ("That's what I meant" = yes, "Not quite" = no, not tapped = empty). Like `feedback_flagged`, the phone may write only this column on its own answers.

The old `judgement` column (the three marks) is dropped in a new migration once the map has replaced it.

**coach_notebooks**
- `user_id`, `notes` (short text), `updated_at`

**weekly_notes** (becomes the coach's note in step F; the key and trigger change from calendar week to every 3 practice days, see "Coach's note")
- `user_id`, `week_start` (the Monday, in the person's timezone), `text`
- `days_covered` (3 to 7: how many scored practice days the saved text was written from), `prompt_version`, `model`, `updated_at`
- Only the `weekly-note` function writes it (through `save_weekly_note`, which refuses a note covering no more days than the saved one). The phone can only read its own.

**listener_ratings** (the listener check, see Evals; no owner and no policies, so only the server key can use it)
- `rater` (a pseudonym, `R1` to `R9`; `R0` is the owner's own test link and never counts), `clip` (`c01`...), `point`, `effort` (1 = no effort at all, 5 = hard work), `has_support`, `clear_ending`, `would_cut`, `stood_out`, `easier` (on the second clip of a pair only), `rated_at`
- Only the `listener-check` function writes it. Friends have no login: each has a secret link, checked against the `LISTENER_RATERS` secret.

Streaks, charts, and "which questions have I seen" are all calculated from `answers`. No separate tables for them. Answers under 10 seconds are never uploaded (see the pipeline rules), so they have no row and do not count toward the streak.

## The feedback pipeline

`process-answer` runs these stages in order. **Each stage saves its result to the answer row before the next one starts.** The app is subscribed to that row, so each result appears on screen as soon as it's saved.

1. **Transcribe.** Send audio to the voice-to-text provider. Must keep filler words and return timings for every word.
2. **Measure.** Plain code, no AI. From the word timings: filler count and which ones, fillers a minute, words per minute, long pauses and whether each falls mid-sentence or between sentences (from the transcript's punctuation), repeats (the same 1 to 3 words said twice in a row), hedges ("kind of", "sort of", "I guess"), vague words ("thing", "a lot", "some") and "and" chaining. Fast, free, and always the same answer for the same input. Vague words and "and" chaining are stored but not shown until the listener check shows they matter.
3. **Map.** Claude reads the transcript once, as a first-time listener, with long pauses marked in the text ("[2.3 s pause]"). It cannot hear tone. It returns:
   - the answer's steps, each labelled Direction, Point, Support, Off track or Ending, with its words and times;
   - the point, restated in one sentence as a listener understood it, and "what I didn't follow", quoting the moments;
   - true restarts (a sentence dropped and begun again), quoting the words;
   - which of the counted fillers, pauses, repeats and hedges a listener would notice, and why, plus patterns code can't count (five sentences in a row starting with "So", one sentence running for 30 seconds), each quoting the moment.

   It never changes a count from Measure; it only decides which counted items matter. Plain code checks that every quote really appears in the transcript. Output must match a strict schema or the stage retries once.
4. **Coach.** Plain code first picks the one thing the tip is about (`pipeline/tipFocus.ts`, from the map and the measurements). It also works out "chose it vs found it" from the labels before the point: Direction or Support before the point means the late point was chosen; Off track before it means it was found while talking. A "say your point first" tip is chosen only when the question wanted a direct answer or circling came before the point. Then Claude reads the metrics, the map, that focus, and the coach's notebook, and writes one tip about it, a better version of the answer with its own steps labelled the same way, and one line saying what changed, in the coach voice from DESIGN.md. The better version may reorder, tighten and cut, and never adds facts, examples or opinions; `npm run evals:coach` checks this.
5. **Update notebook.** Claude updates the short notebook: recurring habits, what's improving, what to focus on next. Kept under a fixed length. Updates happen in the order answers were given: the notebook remembers the time of the newest answer it has absorbed (`last_answer_at`), an older answer never changes it, and two answers processed at once can't overwrite each other.

Rules:
- Each stage is its own file with a typed input and output. Stages don't know about each other.
- Each stage can be re-run safely. If the pipeline stops halfway, it picks up from the last saved stage.
- If a stage fails twice, `status` becomes `failed` and the app shows a calm retry option. The recording is never lost.
- Answers under 10 seconds are never uploaded: the app shows "say a bit more", keeps nothing, and the take does not count toward the streak. The pipeline only ever sees answers of 10 seconds or more.
- The 10-answers-per-day limit is checked at the start of `process-answer`.
- Countable things are plain code. True restarts, and whether a listener would notice something, need judgment and come from the Map stage, always quoting the words.
- When the timer stopped an answer, a missing ending is not a fault: the tip is never about the ending, and the screen says "Time ran out" instead.
- Answers given before the map existed are mapped once from their saved transcripts, the starting point first.

## Swappable providers

Two interfaces in `_shared/providers/`:

```ts
interface Transcriber {
  transcribe(audio: Uint8Array): Promise<Transcript>; // words + timings, fillers kept
}

interface Model {
  generate<T>(args: { prompt: PromptFile; input: unknown; schema: Schema<T> }): Promise<T>;
}
```

Every stage uses these interfaces, never a provider's own library directly. Switching providers means adding one new file and changing one line of config.

## Prompts

- Each prompt is its own file in `_shared/prompts/`, with a version number at the top.
- Changing a prompt means bumping its version.
- The versions used are saved on every answer in `pipeline_version`.

## Reminders

Handled entirely on the phone:
- Schedule one local notification a day, as one-off date notifications for the next 30 days (iOS keeps at most 64 pending).
- The whole schedule is rebuilt (cancel all, then schedule) when the app opens or comes to the front, when the reminder time changes, and when an answer is saved. Today's is left out once the user has practiced, so it never fires after they have.
- The daily answer limit counts from the start of the person's own day, using the timezone saved on their profile (UTC until they have one).

## Scheduled cleanup

A daily database job deletes audio older than 30 days, except each user's baseline recording. Text and scores are kept. Clips chosen for the evals are copied to eval storage first (the private `eval-clips` bucket, no policies, files named by clip code), so the cleanup doesn't remove them. The cleanup never touches `eval-clips`.

## Coach's note

**Target (step F):** a note is written after every 3 practice days with scored answers, not per calendar week, from the same numbers as the Progress screen (see below). Opening Progress again with nothing new costs no AI call.

**Today (built in step 8, carried over and re-keyed in step F):** the note covers a calendar week. The safety mechanics below (the claim, cooldown, attempt caps, deadline, `writing` and `gaveUp`, provider loading) carry over to the new trigger; only what the claim is keyed on changes. Today it works like this. Covers this week (Monday to Sunday, in the person's timezone). The Progress screen asks the `weekly-note` function every time it is shown, and the function decides:
- Fewer than 3 practice days this week: no note.
- Fewer than 3 days with scored answers: no new note (answers still being processed don't count yet; the saved note, if any, is returned).
- Otherwise a note is written when more days have scores than the saved note covers (`days_covered`), so the first note comes on the third scored day and is rewritten on each new day after that. Opening Progress again with nothing new costs no AI call. At most 5 notes a week.
- Before asking the model, a request must win an atomic claim (`claim_weekly_note`, table `weekly_note_claims`, server only). The claim is refused when the saved note already covers the days (decided inside the same statement, so a no-op never uses an attempt), when the last attempt was under 180 seconds ago, or when the week has had 20 failed attempts in a row. Attempts start again after 6 hours without one, so an outage that has ended can't lock the week. The days must be 3 to 7, like the table. Two devices, a retry or a script in a loop get the saved note back, so a paid call is not made twice at once. Saving a note resets the count. The cost ceiling is 20 attempts in any 6 hours per week key, with 2 model calls per attempt. Claims from weeks more than two weeks old are removed as new ones are written.
- A model call has one 20-second deadline over the whole request, body included, and the SDK does not retry on its own (it would sleep for as long as a busy server's `retry-after`, with no ceiling). The stage tries twice, so the worst case is 40 seconds inside the 180-second claim. A test checks the sums.
- Everything the note is written from is read before the claim, so a database error doesn't use an attempt. When a note is due but another request holds the claim, the reply says `writing: true` ("not ready yet") and the phone looks again every 20 seconds until the note appears or a request fails (showing the tab again is the retry). When the week's attempts are used up and the cooldown has passed, it says `gaveUp: true`, and the phone says the note couldn't be written yet and will be tried again later.
- The weekly note function loads only the Claude provider (`providers/claude.ts`), so a missing voice-to-text key can't stop it from starting. The Anthropic SDK and the Supabase auth package (`@supabase/server`) are pinned to exact versions.

The note is written from counted numbers only, never a transcript. Today those are per-day filler words a minute, words a minute, clear point out of 6, the starting point, and the coach's notebook. From step F they are the Progress numbers below, the starting point and the notebook. `_shared/weeklyFacts.ts` computes them with the same rules as the phone's chart.

## Progress chart

Target (step F). The last 14 practice days, rolling, one point per practice day; nothing resets on Monday. Only first attempts on new questions shape the numbers (a retry follows the better version, so it would flatter them). Several first attempts on a day are averaged. An answer with no map yet is left out of the numbers but still counts as a practice day, like the streak.

- **Headline:** "Clear by the end, X of your last 10 answers": first attempts where `listener_confirmed` is yes.
- **Direction early:** how many answers have a Direction or Point step starting in about the first 15 seconds.
- **Off-track time:** the share of the answer's time in Off track steps.
- **Stumbles a minute:** mid-sentence pauses plus restarts. Restarts join only once the map eval shows their count is stable from run to run.
- **Filler words a minute:** shown only when fillers have been a problem for this person.
- Words a minute is no longer charted (no speed is ideal); it stays on the feedback screen as too fast, good or too slow.
- A faint dotted line marks the starting point, and one sentence compares today with it.
- A line stays only if the listener check shows it goes with answers real listeners found easier to follow.

Today (step 8): calendar week, Monday to Sunday, three rows (filler words a minute, words a minute, clear point out of 6).

## Security

- API keys only exist as Supabase secrets, used inside edge functions.
- The recordings bucket is private. Files are stored as `userId/answerId.m4a`.
- Row Level Security on every table.
- "Delete all my data" removes the user's rows, recordings, and account.

## Evals (checking the feedback is actually right)

The `evals/` folder holds:
- **Test recordings:** 30 to 50 clips, deliberately varied (rambling, structured, full of fillers, very short). Starts with our own recordings, later adds tester clips where `consent_to_improve` is yes.
- **Labels:** the correct filler count for each clip, and the correct map, written by hand.
- **Scripts** that run each stage on every clip and report the checks below.

**The listener check (real people).** The base for most other checks:
- 2 or 3 friends listen to 25 to 30 of the owner's clips, as audio, once each. The clips are varied: rambling and tidy, both categories, and 5 to 8 first-try-and-retry pairs.
- For each clip, they write the point in one sentence, rate how easy it was to follow (1 to 5, each step labelled), and note anything that stood out to them. For retry pairs, they say which version was easier to follow.
- A calibration round on a few shared clips comes first.
- A simple rating page, so raters don't handle audio files or spreadsheets. It is one static file (`evals/listener/page/index.html`, hosted on Vercel) with no keys. It talks to the `listener-check` edge function, which plays each clip through a 15-minute signed link from `eval-clips` and saves the ratings. The clip list (`supabase/functions/listener-check/clips.json`, ids and tags only) ships with the function. Friends also answer three yes/no questions: was there a reason or example, did it end clearly, was there a part they'd cut.
- The tests are written down before any rating: `evals/listener/preregistered.md`.
- It answers three questions:
  - Does the AI listener's restatement match what real listeners heard?
  - Does the AI flag what real listeners noticed?
  - Which Progress numbers go with "easier to follow"? Four are chosen in advance: seconds to the point, off-track time, vague words, "and" chaining.
- Report agreement between raters with its uncertainty. Compare the AI against the raters' average using agreement that discounts lucky matches (kappa), not plain percent agreement.

**Per stage:**
- **Transcribe:** filler count accuracy against the hand counts (`npm run evals`).
- **Measure:** unit tests (same input, same numbers).
- **Map** (`evals:map`, replacing `evals:judge`): agreement with the owner's hand-labelled maps (kappa), the right point found, restarts found, the same result when run twice, every quote real, speed and cost. A check that it doesn't favour short, thin answers. Its first run is the baseline.
- **Coach** (`evals:coach`): the better version adds nothing, the tip follows the voice rules, the tip targets the real biggest weakness, cost.
- **Coach's note** (`evals:weekly`): numbers come from the facts, no praise, short, no false improvement claims, ends with a next step.

Run the evals after every prompt or model change. A change only ships if the scores stay the same or improve.

## Build order

Each step works end to end on a real iPhone before starting the next.

Built:
1. **Design system:** color, type, and spacing tokens, plus 4 to 5 core components, in light and dark.
2. **Record and replay:** permission, the recording circle, stop, play back.
3. **Sign in and upload:** Sign in with Apple, upload audio, create the answer row.
4. **Transcribe and measure:** first stages of the pipeline, numbers on screen.
5. **Judge and coach:** AI stages, staged feedback reveal.
6. **Retry and compare:** try again, before-and-after screen.
7. **Home, streak, reminders, onboarding.**
8. **Progress:** chart, weekly note, starting-point comparison. (Not yet checked on a real iPhone; see FOLLOWUPS.md.)
- **B. New measures and the timer:** pause location, fillers a minute, repeats, hedges, vague words, "and" chaining; 2 minutes on a first try, 90 seconds on a retry. Checked on a real iPhone on 2026-10-24.

Next, the feedback redesign:
- **A. Listener check:** record clips, build the rating page, friends rate. Part 1 (the page and setup) is built; part 2 (new clips and the ratings) is next. Runs alongside C.
- **C. The Map stage replaces the judge:** the map eval (needs A's clips), mapping old answers, dropping the marks.
- **D. Coach and the new feedback screen:** listener restatement and the tap, the tip from the map, the better version with its steps and "what changed", noticed lines. The visual design is done in Claude Design before this step.
- **E. Retry:** the instruction carried over, the 90-second retry, the new before and after.
- **F. Progress:** rolling 14 days, the new lines (decided by A's results), the coach's note every 3 practice days.

Then:
9. **Settings, delete data, TestFlight.**

Evals are built alongside step 4 and grow with steps 5 and 6, then with A to F.

**Where the code is:** this file describes the app after A to F. Until those steps land, the code still has the judge stage and its three marks (`judgement`, `evals:judge`), and the calendar-week note and chart. Each step's plan says what it changes.

## Open decisions

- **Voice-to-text provider: decided (2026-10-03), ElevenLabs Scribe v2.** Tested on 4 labelled recordings of one speaker (17 um/uh sounds): Scribe caught 17, Deepgram Nova-2 15, Nova-3 10. AssemblyAI Universal-3.5 Pro also caught 17 but gave different counts on repeat runs of the same audio. Revisit with more speakers and natural (unscripted) clips once beta testers are recording, and check ElevenLabs' data-retention terms before the privacy note is written.
- **Map, coach and notebook model: Claude Sonnet 5.5, kept from the judge decision below; the map eval (step C) checks it.** History, from when the judge existed: **Judge, coach and notebook model: decided (2026-10-07), Claude Sonnet 5.5.** On 9 labelled answers (guide v1) it agreed with the owner's marks on 65% of marks against 72% for Sonnet 5, a gap of 4 marks that is within noise on 9 clips. Both gave the same marks on 8 of 9 clips run twice. Sonnet 5.5 is the current Sonnet, faster (3.2 s against 5.0 s a call) and cheaper. See `evals/results/judge.md`. Known gaps in guide v1: a timer cut-off is scored 0 on ending even when the answer wrapped up, and "reason or example" is the least reliable mark. Plain code handles the first (a timer-stopped answer never gets an ending tip, and the screen says "Time ran out" for the ending instead of a mark) and ranks the second last when choosing the tip. Revisit when the judge is redesigned with more answers and more than one rater.
- **Recording circle:** Reanimated for the circle, `react-native-svg` for the ring. Skia only if it can't look smooth on a real phone.
