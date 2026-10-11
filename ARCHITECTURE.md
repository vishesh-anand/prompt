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
        Transcribe → Measure → Judge → Coach → Update notebook
        (writes results to the answer row after each stage)
```

## Decisions

| Decision | Choice | Why |
|---|---|---|
| App | Expo + TypeScript, iOS first | Readable for us, native feel via @expo/ui, Android later |
| Backend | Supabase | Database, storage, auth, and server code in one place |
| Judge and coach AI | Claude, behind a swappable interface | Best at strict rubrics and a consistent tone |
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
- Anthropic API for judge, coach, notebook, and weekly note
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
- `audio_path`, `duration_ms`, `audio_deleted_at`
- `status`: `uploaded` → `transcribed` → `measured` → `judged` → `coached`, or `failed`
- `transcript` (words with start and end times)
- `metrics` (fillers, pace, pauses, restarts)
- `judgement` (clear point scores, with quoted evidence)
- `coaching` (one tip, better version)
- `pipeline_version` (which prompts and models produced this, for comparisons)
- `feedback_flagged` ("This feedback is wrong" was pressed)

**coach_notebooks**
- `user_id`, `notes` (short text), `updated_at`

**weekly_notes**
- `user_id`, `week_start` (the Monday, in the person's timezone), `text`
- `days_covered` (3 to 7: how many scored practice days the saved text was written from), `prompt_version`, `model`, `updated_at`
- Only the `weekly-note` function writes it (through `save_weekly_note`, which refuses a note covering no more days than the saved one). The phone can only read its own.

Streaks, charts, and "which questions have I seen" are all calculated from `answers`. No separate tables for them. Answers under 10 seconds are never uploaded (see the pipeline rules), so they have no row and do not count toward the streak.

## The feedback pipeline

`process-answer` runs these stages in order. **Each stage saves its result to the answer row before the next one starts.** The app is subscribed to that row, so each result appears on screen as soon as it's saved.

1. **Transcribe.** Send audio to the voice-to-text provider. Must keep filler words and return timings for every word.
2. **Measure.** Plain code, no AI. From the word timings: filler count and which ones, words per minute, long pauses, restarts. Fast, free, and always the same answer for the same input.
3. **Judge.** Claude scores: clear main point, a reason or example, a proper ending. Uses a fixed marking guide with defined levels. Every score must quote the words from the transcript that justify it. Output must match a strict schema or the stage retries once.
4. **Coach.** Plain code first picks the one thing the tip is about (`pipeline/tipFocus.ts`, from the scores and measurements). Then Claude reads the metrics, the judgement, that focus, and the coach's notebook, and writes one tip about it and a better version of the answer in the coach voice from DESIGN.md. The better version may reorder, tighten and cut, and never adds facts, examples or opinions; `npm run evals:coach` checks this.
5. **Update notebook.** Claude updates the short notebook: recurring habits, what's improving, what to focus on next. Kept under a fixed length. Updates happen in the order answers were given: the notebook remembers the time of the newest answer it has absorbed (`last_answer_at`), an older answer never changes it, and two answers processed at once can't overwrite each other.

Rules:
- Each stage is its own file with a typed input and output. Stages don't know about each other.
- Each stage can be re-run safely. If the pipeline stops halfway, it picks up from the last saved stage.
- If a stage fails twice, `status` becomes `failed` and the app shows a calm retry option. The recording is never lost.
- Answers under 10 seconds are never uploaded: the app shows "say a bit more", keeps nothing, and the take does not count toward the streak. The pipeline only ever sees answers of 10 seconds or more.
- The 10-answers-per-day limit is checked at the start of `process-answer`.

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

A daily database job deletes audio older than 30 days, except each user's baseline recording. Text and scores are kept.

## Weekly coach note

Covers this week (Monday to Sunday, in the person's timezone). The Progress screen asks the `weekly-note` function every time it is shown, and the function decides:
- Fewer than 3 practice days this week: no note.
- Fewer than 3 days with scored answers: no new note (answers still being processed don't count yet; the saved note, if any, is returned).
- Otherwise a note is written when more days have scores than the saved note covers (`days_covered`), so the first note comes on the third scored day and is rewritten on each new day after that. Opening Progress again with nothing new costs no AI call. At most 5 notes a week.
- Before asking the model, a request must win an atomic claim (`claim_weekly_note`, table `weekly_note_claims`, server only). The claim is refused when the saved note already covers the days (decided inside the same statement, so a no-op never uses an attempt), when the last attempt was under 180 seconds ago, or when the week has had 20 failed attempts in a row. Attempts start again after 6 hours without one, so an outage that has ended can't lock the week. The days must be 3 to 7, like the table. Two devices, a retry or a script in a loop get the saved note back, so a paid call is not made twice at once. Saving a note resets the count. The cost ceiling is 20 attempts in any 6 hours per week key, with 2 model calls per attempt. Claims from weeks more than two weeks old are removed as new ones are written.
- A model call has one 20-second deadline over the whole request, body included, and the SDK does not retry on its own (it would sleep for as long as a busy server's `retry-after`, with no ceiling). The stage tries twice, so the worst case is 40 seconds inside the 180-second claim. A test checks the sums.
- Everything the note is written from is read before the claim, so a database error doesn't use an attempt. When a note is due but another request holds the claim, the reply says `writing: true` ("not ready yet") and the phone looks again every 20 seconds until the note appears or a request fails (showing the tab again is the retry). When the week's attempts are used up and the cooldown has passed, it says `gaveUp: true`, and the phone says the note couldn't be written yet and will be tried again later.
- The weekly note function loads only the Claude provider (`providers/claude.ts`), so a missing voice-to-text key can't stop it from starting. The Anthropic SDK and the Supabase auth package (`@supabase/server`) are pinned to exact versions.

The note is written from counted numbers only (per-day filler words a minute, words a minute, clear point out of 6, the starting point, and the coach's notebook), never a transcript. `_shared/weeklyFacts.ts` computes them with the same rules as the phone's chart.

## Progress chart

Calendar week, Monday to Sunday on the phone. Three small rows (filler words a minute, words a minute, clear point out of 6), each on its own scale. One point per practice day; a faint dotted line marks the starting point. Only first attempts shape the lines (a retry follows the better version, so it would flatter the week). Several first attempts on a day are averaged. An answer with no scores yet is left out of the lines but still counts as a practice day, like the streak. When the 60 seconds ran out, the ending is left out and the other two marks are scaled to 6.

## Security

- API keys only exist as Supabase secrets, used inside edge functions.
- The recordings bucket is private. Files are stored as `userId/answerId.m4a`.
- Row Level Security on every table.
- "Delete all my data" removes the user's rows, recordings, and account.

## Evals (checking the feedback is actually right)

The `evals/` folder holds:
- **Test recordings:** 30 to 50 clips, deliberately varied (rambling, structured, full of fillers, very short). Starts with our own recordings, later adds tester clips where `consent_to_improve` is yes.
- **Labels:** the correct filler count and the correct clear-point scores for each clip, written by hand.
- **A script** that runs each stage on every clip and reports:
  - Filler count accuracy
  - How often the judge agrees with the labels
  - Whether the judge gives the same score when run twice on the same clip
  - Whether the tip targets the real biggest weakness

Run the evals after every prompt or model change. A change only ships if the scores stay the same or improve.

## Build order

Each step works end to end on a real iPhone before starting the next.

1. **Design system:** color, type, and spacing tokens, plus 4 to 5 core components, in light and dark.
2. **Record and replay:** permission, the recording circle, stop, play back.
3. **Sign in and upload:** Sign in with Apple, upload audio, create the answer row.
4. **Transcribe and measure:** first stages of the pipeline, numbers on screen.
5. **Judge and coach:** AI stages, staged feedback reveal.
6. **Retry and compare:** try again, before-and-after screen.
7. **Home, streak, reminders, onboarding.**
8. **Progress:** chart, weekly note, starting-point comparison.
9. **Settings, delete data, TestFlight.**

Evals are built alongside step 4 and grow with steps 5 and 6.

## Open decisions

- **Voice-to-text provider: decided (2026-10-03), ElevenLabs Scribe v2.** Tested on 4 labelled recordings of one speaker (17 um/uh sounds): Scribe caught 17, Deepgram Nova-2 15, Nova-3 10. AssemblyAI Universal-3.5 Pro also caught 17 but gave different counts on repeat runs of the same audio. Revisit with more speakers and natural (unscripted) clips once beta testers are recording, and check ElevenLabs' data-retention terms before the privacy note is written.
- **Judge, coach and notebook model: decided (2026-10-07), Claude Sonnet 5.5.** On 9 labelled answers (guide v1) it agreed with the owner's marks on 65% of marks against 72% for Sonnet 5, a gap of 4 marks that is within noise on 9 clips. Both gave the same marks on 8 of 9 clips run twice. Sonnet 5.5 is the current Sonnet, faster (3.2 s against 5.0 s a call) and cheaper. See `evals/results/judge.md`. Known gaps in guide v1: a timer cut-off is scored 0 on ending even when the answer wrapped up, and "reason or example" is the least reliable mark. Plain code handles the first (a timer-stopped answer never gets an ending tip, and the screen says "Time ran out" for the ending instead of a mark) and ranks the second last when choosing the tip. Revisit when the judge is redesigned with more answers and more than one rater.
- **Recording circle:** Reanimated for the circle, `react-native-svg` for the ring. Skia only if it can't look smooth on a real phone.
