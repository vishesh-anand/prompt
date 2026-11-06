# DESIGN.md

How the app looks, moves, and talks. Read this before building or changing any screen.

## The feeling

**Calm and simple, like a quiet room.** Speaking out loud to a phone makes people a little nervous. Every screen should lower that nervousness: lots of empty space, very little on screen at once, soft colors, and one warm accent.

What the app helps with: a listener gets your point, and it costs them little effort (see PRODUCT.md). Every screen should make that one idea easy to see.

The feedback screen's look was decided in Claude Design on 2026-11-07 (see "Feedback reveal" below; mockups in `design-system/feedback-d2/`). The before-and-after and Progress screens will be revisited the same way before steps E and F. Until then, this file sets what is on those screens and in what order, and the current visual style stays.

The app is plain almost everywhere, and beautiful in three places:

1. **The recording screen** (the glowing circle)
2. **The feedback reveal**
3. **The before-and-after after a retry**

Put extra care into those three. Keep everything else simple and quiet.

## Core rules

- One main action per screen. If a screen has two equally important buttons, it's wrong.
- Use empty space instead of lines, boxes, and borders to separate things.
- No drop shadows, gradients, or decorative images.
- Follow the phone's light or dark setting. Every screen must work in both from day one.
- Use Apple's standard components (through `@expo/ui` SwiftUI) for buttons, lists, sheets, toggles, pickers, and settings. Build custom only for the three moments above and the progress chart.
- Standard controls are tinted from the tokens (`accent`, `fill`), never left in the system's cool default grey.
- One filled button per screen: the primary. Other actions are plain text buttons, and at most two actions are stacked.
- Every custom control shows what it does on screen, with a word or an SF Symbol, not only through VoiceOver.
- Every full-screen flow has a visible way out (Cancel or ✕ at the top). The back swipe stays, but is never the only way.
- The main action sits within thumb reach, in the lower half of the screen.
- Each top-level screen (Progress, Settings, the before-and-after) starts with its name in `largeTitle`, in the same place every time.
- An empty or waiting state is one calm sentence, optionally with a faint outline of what will appear. One per screen, never a stack of "not yet" lines.

## Colors

Colors are defined once as named tokens and used everywhere by name. Never write a color value directly in a screen.

| Token | Used for | Light | Dark |
|---|---|---|---|
| `background` | Screen background | `#F5F1EB` warm off-white | `#16130F` warm near-black |
| `surface` | Cards, sheets | `#FFFFFF` | `#221E19` |
| `textPrimary` | Main text | `#1F1B16` | `#F3EEE8` |
| `textSecondary` | Supporting text, labels | `#6B645C` | `#A39B91` |
| `accent` | Record button, streak, main buttons | `#E8643C` warm coral | `#F07A52` |
| `onAccent` | Label on an accent-colored button | `#1F1B16` | `#16130F` |
| `accentText` | Accent-colored text and links | `#B8461F` | `#F59A78` |
| `accentSoft` | Glow behind the circle, soft highlights | `#E8643C` at 15% | `#F07A52` at 12% |
| `positive` | Improvement (fewer fillers, better score) | `#2F7549` | `#6BBF8A` |
| `divider` | Rare separators only | `#ECE6DE` | `#2E2923` |
| `fill` | Control fills: segmented track, quiet fills, pickers | `#ECE6DE` | `#2E2923` |

Rules:
- `background` and `surface` differ enough that a card shows by tone alone (light 1.13:1, about Apple's grouped background). It was `#FBF8F4` (1.06:1), where cards nearly vanished.
- The dark glow is 12%, not 20%: at 20% it read as a muddy brown ring. Checked on a real iPhone on 2026-11-06, with the warmer background and the new type styles.
- The accent is precious. Use it only for the one thing you most want tapped, plus the streak.
- Never show red. Mistakes are not failures in this app. A problem is shown with plain text, not an alarm color.
- Button labels on `accent` use `onAccent` (dark), not white. White on the coral is only 3.3:1 in light and 2.8:1 in dark. `onAccent` is 5.2:1 and 6.7:1. A deeper coral with white labels was considered and turned down: it only works in light mode (dark has no coral that passes with white), so the two modes would differ, and the coral would lose its brightness.
- Light `positive` was darkened from `#3F8F5E` (3.7:1 on `background`) to `#2F7549` (5.3:1) so short lines of text pass. On today's warmer `background` it is 5.0:1.
- Never use color alone to carry meaning. Always pair it with a word, number, or arrow.

## Lettering

- **Apple's standard font** (San Francisco) for everything by default.
- **Apple's built-in serif font** (New York, `fontFamily: 'ui-serif'` on iOS) only for:
  - The daily question
  - The rewritten "better version" of your answer
  - The coach's note
- Use Apple's standard text sizes so the app respects the user's text-size setting (Dynamic Type).

| Style | Size | Weight | Font |
|---|---|---|---|
| Large title (the name of a top-level screen) | 34 | Bold | Standard |
| Question | 28 | Regular | Serif |
| Big number (streak, filler count) | 34 | Semibold | Standard, tabular figures |
| Title (a heading inside a screen or sheet, and the tip) | 22 | Semibold | Standard |
| Headline (a long, important line: the feedback headline) | 17 | Semibold | Standard |
| Body | 17 | Regular | Standard |
| Better version (and the coach's note) | 19, line height 27 | Regular | Serif |
| Subheadline (group labels) | 15 | Regular | Standard, `textSecondary` |
| Label | 13 | Medium | Standard, `textSecondary` |
| Caption (times, small notes) | 12 | Regular | Standard, `textSecondary` |

Rules:
- Big number is for digits only. A word ("Too slow", "Good") uses Headline.
- A sub-label is never bigger than the heading above it. Items under a group label use the same size or smaller, and set themselves apart by color or weight.
- Every number that changes or sits in a column uses tabular figures (`fontVariant: ['tabular-nums']`): counts, times like 0:40, percentages, numbers that count into place.
- Long serif reading text gets about 1.4x leading. Everything else uses the font's natural leading (about 1.2x).
- Text on screen uses typographic quotes and apostrophes (’ “ ”), including coach text and the speaker's quoted words. One shared formatter at display time, not a prompt change.

## Spacing and shape

- Spacing steps: 4, 8, 12, 16, 24, 32, 48. Nothing in between.
- Screen side margins: 24.
- Rounded corners: 16 for cards, 12 for buttons, full circle for the record button.
- The record button is large: at least 88 across, and easy to hit with a thumb.

## Movement

- Normal transitions: smooth and short, about 0.2 to 0.3 seconds, gentle ease.
- Everything important uses spring-style motion (settles naturally, no bounce-bounce-bounce). There are two springs, defined once in `app/src/design/motion.ts`: **gentle** (reveals, things settling; no overshoot) and **firm** (a response to a tap). Every spring uses one of them, never its own numbers. Tune both on a real phone.
- If the user has turned on Reduce Motion in iPhone settings, replace movement with simple fades.
- All animation runs on the UI thread with Reanimated, so it never stutters.

## Vibration (haptics)

Only in these moments. Nowhere else.

| Moment | Feel |
|---|---|
| Start recording | Light tap |
| Stop recording | Medium tap |
| Feedback appears | Soft tap |
| You improved on retry (the retry instruction was met) | Success pattern |
| Toggling a setting | Selection click |

## The three special moments

### 1. Recording screen
- The question stays at the top, in the serif font.
- In the center, a soft coral circle that gently grows and shrinks with your voice. Loud voice, slightly bigger. Silence, it settles slowly. It should feel like breathing, never jittery.
- A thin ring around the circle fills up as the time runs out (2 minutes, or 90 seconds on a retry). No big countdown numbers.
- On a retry, the one instruction from the tip sits under the question, in the standard font, quieter than the question.
- One button: tap the circle to stop.
- Until you start, a small text "Cancel" sits at the top to leave. It goes away once recording starts, so it never throws away a take and nothing else is on screen while you speak.
- Wherever the circle is a button outside this screen (Home), it carries a short word or a microphone symbol, so it's clear what it does.
- Background stays calm. Nothing else on screen.

### 2. Feedback reveal
Decided in Claude Design on 2026-11-07 after four rounds. The mockups are in `design-system/feedback-d2/` (live canvas: https://claude.ai/artifact/KtuV1eFKmnUKCbgEY5c4nT). They are web markup with colours written out: build from this section and the tokens, and use the mockups for layout, spacing and copy.

- A short, calm "listening" state while feedback is prepared. Not a spinner. The circle slowly settles and fades.
- Results appear one at a time, top to bottom, with a small delay between each (about 0.12 seconds), in the order below. Each part appears as soon as its pipeline stage has saved it, so a later part may arrive a few seconds after an earlier one. While the tip is still being written, its card shows a faint outline (`fill` bars on `surface`) and one `label` line: "Writing your tip. This usually takes a few seconds."
- The screen scrolls on `background`, with side margins of 24 and 16 between parts. "Try again with this tip" is pinned at the bottom, outside the scroll.

Top to bottom:
1. **Top bar:** "Work · first try" (or "Everyday", "second try") in `label`, and "Done" in `accentText` headline weight on the right.
2. **The question,** in full, in the `betterVersion` style (serif). Never cut off.
3. **Headline** in `headline` (17 semibold): "You found your point while talking, after two off-track steps."
4. **The answer line** (custom drawing): one bar 10 tall, a segment per step, widths by time, 3 apart, rounded. Off track is a solid `textSecondary` segment, Point a solid `textPrimary` segment, and Direction, Support and Ending are outlined in `textSecondary` (1.5 wide). The colours mean the same in light and dark. Under it, the steps in order in `label` with `textPrimary`: "Off track → Support → Off track → **Point at 1:10** → Ending" (the point semibold, its time tabular). The line wraps; the segments carry no text, so they survive large text and short steps. Then "Step by step ›" in `accentText` semibold, 44 tall. The whole block is one button; VoiceOver reads it as one sentence ("Off track, support, off track, then your point at 1:10, then an ending. Opens step by step.").
5. **The tip** on a `surface` card (radius 16, padding 20): "Your one thing for next time" in `label` with `accentText`, then the tip in `title` (22 semibold), the largest text on the screen; then one `body` line with the reason; then the moment it is about, quoted, in `label`. Nothing else in the card.
6. **What an AI listener understood** on a `surface` card: that heading in `label`, the restatement in `body`, then "That's what I meant" and "Not quite" as quiet capsule buttons (`fill`, `body`, 44 tall). Once one is tapped, only that one stays, with a check in `accentText`, and it can be tapped again to undo. When the listener lost the thread, a last row: a time button ("▶ 0:40": `fill` capsule, 44 tall, `textPrimary` semibold tabular label, `accentText` play symbol) that plays from that moment, then "It lost the thread here, when you moved to the timer." in `body`.
7. **A grouped list** on `surface` (radius 16, inset `divider` lines between rows): "Shorter and clearer" with "Your answer, with the point moved to the front" under it in `label`; "How it sounded" with "3 moments a listener would notice"; "Play your answer" with its length and a play symbol in `accentText`. The first two open sheets. A clean answer has no "How it sounded" row.
8. **"This feedback is wrong"** as a quiet text button in `label`, centred, 44 tall.
9. **"Try again with this tip"**, the only filled button: `accent` with an `onAccent` label, radius 12, 52 tall.

The sheets (each with a grabber, its name in `title` and "Done" at the top right):
- **Step by step:** one `label` line saying what differs, then two columns, "Yours · 1:52" and "Shorter and clearer". Each step: its time in `label` (your own steps only; the shorter version has no real times), the label word in `body` semibold, and a short quote in `label` with `textPrimary`. Plain text, no boxes or colours per label: the word carries the meaning.
- **Shorter and clearer:** one line saying what changed and that nothing was added, then the better version in `betterVersion`.
- **How it sounded:** one line saying the moments are counted from the recording and the AI listener picked the ones a person would notice. Then one row per moment: its time button (as above) and the line in `body`, ending with what to do next.

Rules:
- Every tap target is at least 44 tall.
- The step labels are PRODUCT.md's five: Direction, Point, Support, Off track, Ending. "Point" everywhere, never "answer" for the speaker's point.
- No numbers or scores on this screen; they belong to Progress and the before-and-after.
- Tapping a time plays the recording from that moment. Tapping "That's what I meant" or "Not quite" gives no haptic.
- The "Try again with this tip" button is the single accent-colored button.

### 3. Before and after
- The retry instruction is checked first, in one plain line: "You told the listener where you were going in your first sentence. Last time, your point came at 1:10."
- First and second tries' maps side by side. The clear version is not shown here; each try keeps its own on its feedback screen.
- Off-track time and stumbles for both tries. Numbers count up or down into place.
- Improvements are marked in `positive` green with an arrow and a short line like "Off track: 40% to 15%."
- If there was no improvement, say so plainly and give one next step. No celebration, no guilt.
- The screen presents the retry as practice, not as proof of progress.

## Progress chart
- Your last 14 practice days, one dot a day. Nothing resets on Monday.
- The headline above it in plain words: "Clear by the end, 8 of your last 10 answers."
- Simple lines: direction early, off-track time, stumbles a minute, and filler words a minute only when fillers have been a problem. Each on its own scale.
- Minimal: no gridlines, no legend box. Label each line directly at its end.
- Compare against the starting point with a faint dotted line, and one plain sentence: "On your first day, 40% of your answer was off track. Now it's 15%."

## How the app talks

**Like a coach who's on your side.** Straight to the point, names exactly what went wrong, and always ends with what to do next.

Rules:
- Talk to "you." Short sentences.
- Use real numbers and real moments from their answer. "Your point came at 40 seconds" beats "try to be more concise."
- The point doesn't have to come first. The rule is "let the listener know early where you're going." Ask for the point first only when the question wanted a direct answer, or when circling came before the point. Work questions often want an answer first; Everyday ones often suit a story.
- Say a few fillers are fine. Flag only what a listener would notice, and never give a "safe" number of fillers.
- Every piece of criticism ends with one concrete next step.
- Never shame. Never generic praise like "Great job!" or "Amazing!"
- Praise only what actually improved, and be specific about it.
- One exclamation mark per screen at most. Usually none.

Examples:

| Don't | Do |
|---|---|
| "Great job! Keep it up!" | "You cut your filler words from 9 to 4." |
| "Your answer lacked structure." | "Your main point came at 40 seconds. Next time, say it in your first sentence." |
| "Too many filler words detected." | "You said 'basically' 6 times. Try a short pause instead." |
| "You used 7 filler words." (for 7 spread over 2 minutes) | Nothing. A listener wouldn't notice them. |
| "Filler words: 4." | "You said 'basically' four times in 20 seconds. It starts to sound like a habit." |
| "Your answer was disorganized." | "You found your point while talking. It came at 1:10, after two passes around it." |
| "Always start with your point." (for a story) | "You set up a story, then landed your point. Easy to follow." |
| "Clarity: 3 out of 5." | "You're saying the app's feedback is too shallow to help you speak clearly." |
| "Oops! Something went wrong." | "That didn't upload. Your recording is saved. Tap to try again." |

## Empty, error, and waiting states
- Every screen has a designed empty state. Example for Progress with no data: "Your chart starts after your first answer."
- Progress before there are enough answers for a headline: "After 3 answers, you'll see how often a listener got your point."
- A map with no clear point: "A listener couldn't find one main point here." The tip then says what to do next.
- Errors say what happened, that nothing was lost (when true), and what to do.
- Never lose a recording. If upload fails, keep it on the phone and retry.

## Accessibility
- Every button and control has a clear VoiceOver label.
- The map and the chart each have a short spoken summary for VoiceOver ("Your point came at 1:10, after two off-track steps").
- Text contrast meets Apple's guidelines in both light and dark.
- Supports the user's text-size setting without breaking layouts.
- Respects Reduce Motion.

## Not in version 1
- Custom illustrations or mascots
- Custom icon set (use Apple's SF Symbols)
- Themes or color choices for users
- Sounds or music
