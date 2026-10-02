# CLAUDE.md

A daily speaking-practice iPhone app. You answer a question out loud for up to 60 seconds, get coach-style feedback, and try again.

Read these before any non-trivial work:
- @PRODUCT.md — what the app does and does not do
- @DESIGN.md — how it looks, moves, and talks
- @ARCHITECTURE.md — how it's built

If a request conflicts with these files, stop and ask. Don't quietly work around them.

## How we work

- **Plan first.** For anything bigger than a small fix, start in plan mode and propose a plan before writing code.
- **One build step at a time,** in the order listed in ARCHITECTURE.md. Each step must work end to end on a real iPhone before the next starts.
- **Small, readable changes.** Prefer deleting code to adding it. No speculative features, options, or abstractions "for later."
- **When something works but feels clumsy,** say so and propose the clean version.
- **Explain in plain words.** The owner knows React and TypeScript well, but is new to Expo and mobile. Briefly explain anything mobile-specific.

## Commands

Update this section as commands change.

- One-time Mac setup: `brew install cocoapods watchman`. On the iPhone, turn on Developer Mode (Settings → Privacy & Security).
- Start the app: `cd app && npx expo start`
- Run on iPhone: `cd app && npx expo run:ios --device` (plug in and unlock the phone). Needed once, and again after adding a library with native code. JS edits after that reload live via `npx expo start`.
- Design preview (dev builds only): open the app, tap "Design preview". Flip Appearance in Control Center to check dark mode.
- Add a library: `cd app && npx expo install <package>` (never `npm i`, so versions match the SDK)
- Type check: `cd app && npx tsc --noEmit`
- Lint: `cd app && npx expo lint`
- One-time backend setup (hosted Supabase project, no local Docker): `npx supabase login` (run it in a real Terminal window, not through Claude's `!` prefix, because it opens a browser), then `npx supabase link --project-ref <ref>` from the repo root. Put the project URL and publishable key in `app/.env.local` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Never the service-role key.
- Push database changes to the hosted project: `npx supabase db push` (new files in `supabase/migrations/` only)
- Deploy edge functions: `npx supabase functions deploy <name>`
- Backend tests: `deno test supabase/functions`
- Evals: `npm run evals` (from `/evals`)

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
- Measuring (fillers, pace, pauses, restarts) is plain code. Never use AI for anything that can be counted.
- Every AI output is validated against a schema.
- Prompts live in `supabase/functions/_shared/prompts/`, each with a version number. Changing a prompt means bumping its version.
- After any prompt or model change, run the evals and report the before-and-after numbers. Don't ship a change that makes them worse.

**Data**
- Never lose a recording. If upload or processing fails, keep it and offer a retry.
- Database changes only through new files in `supabase/migrations/`. Never edit an old migration.
- Voice recordings never go in git. Eval audio stays in Supabase storage or a git-ignored folder; only labels and results are committed.

## Scope

If something is listed under "Not in version 1" in PRODUCT.md or DESIGN.md, don't build it, even partly. Mention it as a later idea instead.
