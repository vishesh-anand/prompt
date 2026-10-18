# CLAUDE.md

A daily speaking-practice iPhone app. You answer a question out loud for up to 2 minutes, get coach-style feedback on whether a listener would get your point and how hard they'd have to work for it, and try again.

Read these before any non-trivial work:
- @PRODUCT.md — what the app does and does not do
- @DESIGN.md — how it looks, moves, and talks
- @ARCHITECTURE.md — how it's built
- @FOLLOWUPS.md — checks not done yet and things left for later (look here when planning a step)

If a request conflicts with these files, stop and ask. Don't quietly work around them.

## How we work

- **Plan first.** For anything bigger than a small fix, start in plan mode and propose a plan before writing code.
- **One build step at a time,** in the order listed in ARCHITECTURE.md. Each step must work end to end on a real iPhone before the next starts.
- **Small, readable changes.** Prefer deleting code to adding it. No speculative features, options, or abstractions "for later."
- **When something works but feels clumsy,** say so and propose the clean version.
- **Explain in plain words.** The owner knows React and TypeScript well, but is new to Expo and mobile. Briefly explain anything mobile-specific.
- **Plans name what's shared.** For each screen or flow, a plan lists what is still mounted underneath it and which shared resources it touches more than once (realtime channels, query keys, the audio session, files on the phone). Step 6's retry crashed because two mounted screens used one realtime channel name.
- **"Done" reports say what was and wasn't run.** Two lists: exercised (types, lint, unit tests, database test, scripted flows) and not exercised (anything on a real phone, anything that needs a person). Passing tests are never presented as "verified" for a flow they don't cover.
- **Before calling a step done:** run `/code-review` on the diff, asking "what else is mounted or shared that this change touches?", and run the scripted flows (`e2e/run.sh`) once they exist.

## Commands

Update this section as commands change.

- One-time Mac setup: `brew install cocoapods watchman`. On the iPhone, turn on Developer Mode (Settings → Privacy & Security).
- Start the app: `cd app && npx expo start`
- Run on iPhone: `cd app && npx expo run:ios --device` (plug in and unlock the phone). Needed once, and again after adding a library with native code. JS edits after that reload live via `npx expo start`.
- Design preview (dev builds only): open the app, tap "Design preview". Flip Appearance in Control Center to check dark mode.
- Add a library: `cd app && npx expo install <package>` (never `npm i`, so versions match the SDK)
- Type check: `cd app && npx tsc --noEmit`
- Lint: `cd app && npx expo lint`
- App tests (jest-expo, pure logic only, no rendered screens): `cd app && npm test`
- Scripted end-to-end flows (Maestro, in `/e2e`): they drive the real app on a dedicated "Prompt E2E" simulator and record real answers (real transcription and Claude, a few cents, counted in the 10 a day).
  - One-time machine setup: `brew install openjdk`, then install Maestro by downloading `https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip` and copying its `maestro/*` into `~/.maestro` (`e2e/run.sh` puts `~/.maestro/bin` on the PATH itself). Plain `brew install maestro` is a different tool, and the official brew tap refuses to build while the Command Line Tools are older than Xcode.
  - One-time simulator: `e2e/setup.sh`, then by hand in that simulator: sign in to an Apple Account in Settings, then `e2e/run.sh --build`, open Prompt and sign in with Apple. The login stays on that simulator.
  - Options: `--free` runs only the flows that record no answer (nothing counts against the 10 a day). `--onboarding` first clears the test account's reminder time so first-time setup shows (the simulator shares the owner's Apple Account, so the owner's phone goes through setup once too; needs `E2E_USER_ID` in git-ignored `e2e/.env`).
  - Run: `e2e/run.sh` (add `--build` after changing app code: a Release build with `EXPO_PUBLIC_E2E=1`, JavaScript bundled in, no Metro). Fails on a failed flow or a new Prompt crash report.
  - The test build swaps the recorder's result for a spoken clip made with `say` (`app/src/features/recording/e2eTake.ts`). The recorder, permission and circle still run; the real microphone is checked by hand on the iPhone each step.
  - The simulator is iOS 26.2 on purpose: iOS 27 currently quits the app at launch (no UIScene lifecycle yet).
- One-time backend setup (hosted Supabase project, no local Docker): `npx supabase login` (run it in a real Terminal window, not through Claude's `!` prefix, because it opens a browser), then `npx supabase link --project-ref <ref>` from the repo root. Put the project URL and publishable key in `app/.env.local` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Never the service-role key.
- Push database changes to the hosted project: `npx supabase db push` (new files in `supabase/migrations/` only)
- Set a backend secret (run in a real Terminal, never paste the key into Claude): `npx supabase secrets set DEEPGRAM_API_KEY=<key>`
- Deploy edge functions: `npx supabase functions deploy <name>` (`process-answer`, `weekly-note`)
- Backend tests: `deno test --allow-read supabase/functions`
- Database rules tests (hosted project, change nothing): `npx supabase db query --linked -f supabase/tests/retry_of.sql`, `-f supabase/tests/step7.sql` and `-f supabase/tests/step8.sql`. Each is one block that always ends in an error; success is the message `RETRY_OF_CHECKS_PASSED` / `STEP7_CHECKS_PASSED` / `STEP8_CHECKS_PASSED`, anything starting with `FAIL` names the broken case.
- Backend type check: `DEEPGRAM_API_KEY=x deno check $(find supabase/functions -name '*.ts')`
- Evals (from `/evals`, keys in `evals/.env`, git-ignored; see `.env.example`):
  - `npm run evals` compares voice-to-text providers on the clips in `evals/labels.json`. Recordings download into `evals/audio/` (git-ignored).
  - `npm run evals:judge` checks the judge against your hand scores (agreement, same score run to run, speed, cost). Writes `evals/results/judge.md`.
  - `npm run evals:weekly` checks the weekly note on 8 hand-made weeks (`evals/weeks.json`): numbers come from the facts, no praise, short, no false improvement claims, ends with a next step. Writes `evals/results/weekly.md`; full notes stay in git-ignored `evals/out/`. Tone is read by a person, not checked by a model.
  - `npm run evals:coach` checks the coach: the better version adds nothing, the tip follows the voice rules, cost per answer. Writes `evals/results/coach.md`. Full tips and rewrites stay in git-ignored `evals/out/`.
  - Add `-- --limit 1` to try one clip first. The AI evals call the Anthropic API and need `ANTHROPIC_API_KEY` in `evals/.env`.
- Set the Anthropic key for the backend (real Terminal, never paste the key into Claude): `npx supabase secrets set ANTHROPIC_API_KEY=<key>`.

Before calling any task done: type check, lint, and tests must pass.

## Rules: never break these

**Security**
- Never put an API key, secret, or provider library in the app. All AI calls happen in Supabase edge functions.
- Every table has Row Level Security. A user can only access their own rows.
- The recordings bucket stays private.

**Design**
- Never write a color, font size, or spacing value directly in a screen. Use the tokens in `app/src/design/`.
- Every screen must work in light and dark mode.
- Use `@expo/ui` SwiftUI components for standard UI (buttons, lists, sheets, toggles, pickers, settings). Custom components only for: the recording circle, the feedback reveal, the before-and-after screen, and the progress chart.
- Every `@expo/ui` `Host` gets `ignoreSafeArea="all"`. Without it, a native view that starts below the screen edge draws ~17pt too high until it re-renders.
- No red, no drop shadows, no gradients.
- All animation uses Reanimated and respects Reduce Motion.
- Haptics only in the moments listed in DESIGN.md.
- All user-facing text follows the coach voice in DESIGN.md.

**Code**
- TypeScript strict mode. No `any`.
- Screen files only arrange things on screen. Logic goes in `app/src/features/`.
- Server data goes through TanStack Query. No global state library.
- Validate all server data with Zod schemas from `app/src/lib/schemas`.

**Pipeline**
- Each pipeline stage is its own file with a typed input and output, and saves its result before the next stage runs.
- Stages use the `Transcriber` and `Model` interfaces only. Never import a provider's library directly in a stage.
- Measuring countable things (fillers, pace, pauses and where they fall, repeats, hedges, vague words, "and" chaining) is plain code. Never use AI for anything that can be counted. True restarts, and whether a listener would notice something, need judgment: they come from the Map stage, which must quote the exact words and never change a count.
- Every AI output is validated against a schema.
- Prompts live in `supabase/functions/_shared/prompts/`, each with a version number. Changing a prompt means bumping its version.
- After any prompt or model change, run the evals and report the before-and-after numbers. Don't ship a change that makes them worse.

**Data**
- Never lose a recording. If upload or processing fails, keep it and offer a retry.
- Database changes only through new files in `supabase/migrations/`. Never edit an old migration.
- Voice recordings never go in git. Eval audio stays in Supabase storage or a git-ignored folder; only labels and results are committed.

## Scope

If something is listed under "Not in version 1" in PRODUCT.md or DESIGN.md, don't build it, even partly. Mention it as a later idea instead.
