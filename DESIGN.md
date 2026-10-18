# DESIGN.md

How the app looks, moves, and talks. Read this before building or changing any screen.

## The feeling

**Calm and simple, like a quiet room.** Speaking out loud to a phone makes people a little nervous. Every screen should lower that nervousness: lots of empty space, very little on screen at once, soft colors, and one warm accent.

What the app helps with: a listener gets your point, and it costs them little effort (see PRODUCT.md). Every screen should make that one idea easy to see.

The visual look of the feedback, before-and-after and Progress screens will be revisited in Claude Design before build step D (see ARCHITECTURE.md). Until then, this file sets what is on each screen and in what order, and the current visual style stays.

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

## Colors

Colors are defined once as named tokens and used everywhere by name. Never write a color value directly in a screen.

| Token | Used for | Light | Dark |
|---|---|---|---|
| `background` | Screen background | `#FBF8F4` warm off-white | `#16130F` warm near-black |
| `surface` | Cards, sheets | `#FFFFFF` | `#221E19` |
| `textPrimary` | Main text | `#1F1B16` | `#F3EEE8` |
| `textSecondary` | Supporting text, labels | `#6B645C` | `#A39B91` |
| `accent` | Record button, streak, main buttons | `#E8643C` warm coral | `#F07A52` |
| `onAccent` | Label on an accent-colored button | `#1F1B16` | `#16130F` |
| `accentText` | Accent-colored text and links | `#B8461F` | `#F59A78` |
| `accentSoft` | Glow behind the circle, soft highlights | `#E8643C` at 15% | `#F07A52` at 20% |
| `positive` | Improvement (fewer fillers, better score) | `#2F7549` | `#6BBF8A` |
| `divider` | Rare separators only | `#ECE6DE` | `#2E2923` |

Rules:
- The accent is precious. Use it only for the one thing you most want tapped, plus the streak.
- Never show red. Mistakes are not failures in this app. A problem is shown with plain text, not an alarm color.
- Button labels on `accent` use `onAccent` (dark), not white. White on the coral is only 3.3:1 in light and 2.8:1 in dark. `onAccent` is 5.2:1 and 6.7:1.
- Light `positive` was darkened from `#3F8F5E` (3.7:1 on `background`) to `#2F7549` (5.3:1) so short lines of text pass.
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
| Question | 28 | Regular | Serif |
| Big number (streak, filler count) | 34 | Semibold | Standard |
| Screen title | 22 | Semibold | Standard |
| Body | 17 | Regular | Standard |
| Better version | 19 | Regular | Serif |
| Label | 13 | Medium | Standard, `textSecondary` |

## Spacing and shape

- Spacing steps: 4, 8, 12, 16, 24, 32, 48. Nothing in between.
- Screen side margins: 24.
- Rounded corners: 16 for cards, 12 for buttons, full circle for the record button.
- The record button is large: at least 88 across, and easy to hit with a thumb.

## Movement

- Normal transitions: smooth and short, about 0.2 to 0.3 seconds, gentle ease.
- Everything important uses spring-style motion (settles naturally, no bounce-bounce-bounce).
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
- Background stays calm. Nothing else on screen.

### 2. Feedback reveal
- A short, calm "listening" state while feedback is prepared. Not a spinner. The circle slowly settles and fades.
- Results appear one at a time, top to bottom, with a small delay between each (about 0.12 seconds), in the order from PRODUCT.md: headline, what a listener understood, one tip, better version, how it sounded. Each part appears as soon as its pipeline stage has saved it, so a later part may arrive a few seconds after an earlier one.
- The one tip is the most prominent item on the screen.
- **What a listener understood:** the restatement in the standard font. "That's what I meant" and "Not quite" are small and quiet, clearly secondary to Try again. Tapping one gives no haptic.
- **The map** sits behind a "See how they're built" tap, right under the better version. It opens your answer's map next to the better version's map: a few steps each, with times and labels (Direction, Point, Support, Off track, Ending). Compact, plain text, no boxes or colors per label; the label word carries the meaning.
- **How it sounded** shows only the lines a listener would notice. A clean answer shows nothing here, not an empty heading.
- The "Try again" button is the single accent-colored button.

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
