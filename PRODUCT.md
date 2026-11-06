# PRODUCT.md

## What this app is

A daily speaking-practice app. You answer one question out loud, the app tells you whether a listener would get your point and how hard they had to work for it, gives you one thing to fix, and you try again. Over weeks, your answers get clearer and easier to follow when you speak without preparation, at work and in everyday conversation.

Being articulate means two things here:
1. **They got it.** A listener understands what you meant.
2. **It cost them little.** They didn't have to wait for the point, sort through detours, or work out what you meant.

A rambling answer can still be understood, so the first is not enough. The app looks at both.

It is for people who know what they want to say, but it comes out messy when they have to say it on the spot. That includes people speaking English as a second language (the owner is one).

The point does not have to come first. What matters is that the listener knows early where you're going: the point itself, or a frame like "Let me tell you what happened last week." A late point you **chose** (a frame, then a build-up, then the point) is a skill. A late point you **found** while talking (circling until you work out what you think) is the habit this app helps you break.

## Goal for version 1

- **First, the owner uses it daily and finds it useful.** Version 1 has fewer features rather than features that don't help.
- Ready for 10 to 20 beta testers through TestFlight, 4 weeks after starting.
- iPhone only for now. Android comes later from the same code.
- **How we judge success:** do testers come back on day 3, day 7, and in week 3? If most stop by week 3, we rethink before building more.

## The daily practice

- **Daily minimum:** answer one question. That keeps your streak going.
- After that, you can keep practicing as much as you want.
- Each answer is **up to 2 minutes**. A retry of the same question is **up to 90 seconds**, so the second try is a little tighter. You can always stop early.
- Before each question, you choose the kind: **Work** or **Everyday conversation**.

## Screens

### 1. Sign in
- Sign in with Apple only. One tap.

### 2. First-time setup
- Pick a reminder time (for example, 8pm).
- Answer your first question right away.
- That first answer is saved as your **starting point**, so you can compare against it later.

### 3. Home
- Choose Work or Everyday conversation.
- See today's question.
- See your streak.
- Big record button.

### 4. Recording
- Tap to start, tap to stop. Stops automatically at 2 minutes (90 seconds on a retry).
- A soft glowing circle that grows and shrinks with your voice, so you know it's recording (see DESIGN.md).
- On a retry, the one instruction from your tip stays under the question, for example "This time: tell the listener where you're going in your first sentence."
- Answers under 10 seconds are not scored. Show a friendly "say a bit more" message.

### 5. Feedback (after each answer)
The question you answered stays at the top, in full. Then, in this order:
1. **Headline:** one line about how your answer was built. For example: "You found your point while talking, after two off-track steps." Or: "You set up a story, then made your point at 0:58."
2. **Your answer's shape:** a thin line of your answer's steps, with the point marked and the steps named underneath ("Off track → Support → Off track → Point at 1:10 → Ending"). Tapping it opens **Step by step**: your answer's map next to the better version's map. A map is the answer as a few steps, each with one of five labels (your own steps also show their time):
   - **Direction:** tells the listener where you're going (a frame or the point)
   - **Point**
   - **Support:** a reason or an example
   - **Off track:** an aside, or repeating yourself without adding anything
   - **Ending**
3. **One tip:** the single most important thing to fix next. Only one. It names a real moment from your answer and becomes the instruction for your retry. It says "say your point first" only when the question asked for a direct answer, or when circling came before the point. It comes before what the listener understood because it is what you act on (decided in Claude Design, 2026-11-07).
4. **What an AI listener understood:** one sentence saying your point back, as a first-time listener heard it. The heading says it is an AI. Two small buttons: **That's what I meant** or **Not quite**. When the listener lost the thread, one more line says where, with the moment's time as a button that plays it: "0:40 · It lost the thread here, when you moved to the timer."
5. **Shorter and clearer** (a row that opens a sheet): your own answer, rewritten to be clearer and tighter. It may reorder, tighten and cut, and never adds facts, examples or opinions. Above it, one line says what changed: "Your point moved to the front, and the part about the timer is gone."
6. **How it sounded** (a row that opens a sheet, showing how many moments there are): only what a listener would likely notice. Each line starts with its time, as a button that plays it, and ends with what to do next:
   - pauses in the middle of a sentence (pauses between sentences sound like thinking and are not flagged)
   - restarts, where you dropped a sentence and began again
   - filler words (um, uh, like, basically, actually, you know, and "so" at the start of sentences), when there are enough to notice or one word becomes a habit. A few fillers are fine; zero is not the goal.
   - hedges, like "kind of", "sort of", "I guess"
   - speed, only when too fast or too slow
   - other patterns a listener would notice, like five sentences in a row starting with "So"

   A clean answer has no row here.
7. **Play your answer** (a row): hear your recording. Optional, never required.
8. **"This feedback is wrong" button:** so testers can flag bad feedback.
9. **Try again with this tip button,** pinned at the bottom: answer the same question again, with the tip as your one instruction.

### 6. Before and after (after trying again)
- **The instruction, checked first:** "You told the listener where you were going in your first sentence. Last time, your point came at 1:10." If it didn't work, say so plainly and give one next step.
- Your first and second tries' maps side by side, so you can see the shape change.
- Off-track time and stumbles for both tries.
- Framed as practice: a second try is easier because you've said it once already. Real progress is measured on new questions (see Progress).

### 7. Progress
- Streak (days in a row practiced).
- Your **last 14 practice days**, one dot a day. Nothing resets on Monday. Only first tries on new questions count, because a retry follows the better version and would flatter the numbers.
- **Headline: "Clear by the end, 8 of your last 10 answers."** An answer counts when the listener's restatement matched what you meant (you tapped **That's what I meant**).
- Underneath, how much effort your answers cost a listener, as lines over time:
  - **Direction early:** how many answers told the listener where they were going in the first 15 seconds or so.
  - **Off-track time:** the share of each answer spent on asides and repeating yourself without adding anything.
  - **Stumbles a minute:** pauses in the middle of a sentence, plus restarts.
  - **Filler words a minute:** shown only when fillers have been a problem for you.
- **Compare against your starting point,** in plain words: "On your first day, 40% of your answer was off track. Now it's 15%."
- **Coach's note:** what improved and what to work on next. Written after every 3 practice days.
- A line stays on Progress only if the listener check (see ARCHITECTURE.md, Evals) shows it goes with answers real listeners found easier to follow.

### 8. Settings
- Change reminder time.
- Delete all my data.
- Sign out.

## Reminders
- One notification a day at the time you picked.
- **Only sent if you haven't practiced yet that day.**

## Questions
- About 100 hand-written questions: 50 Work, 50 Everyday conversation.
- No repeats until you've seen every question in that category.
- AI-generated questions are **not** in version 1. Planned for later.

## Limits
- Maximum 10 answers per person per day, to control costs.

## Privacy
- A short, plain note explaining that recordings and transcripts are stored to show your progress and improve the feedback.
- "Delete all my data" removes everything.

## Tracking (for the beta)
- Record only what's needed to answer: who came back, on which days, and how many answers they gave.
- Count how often "This feedback is wrong" is pressed.
- Count how often "That's what I meant" and "Not quite" are pressed.

## Not in version 1
- Payments or subscriptions
- Android
- Video, eye contact, or body language
- Pronunciation, accent, grammar, or word-choice coaching (planned for a later version; see below)
- Tone of voice
- Cues while you are recording
- Planning time before you answer (the app trains speaking without preparation)
- AI-generated questions
- Social features, sharing, or leaderboards
- Any login other than Sign in with Apple

## Decisions to revisit after the beta
- Should trying again be required for the streak?
- Add AI-generated questions based on each person's weak spots.
- Add pronunciation, grammar and word-choice feedback. Word choice is probably first.
- Let the AI listen to the audio itself, not only the transcript, so it can hear tone and pauses.
- Make "seconds until your point" the Progress headline, if the listener check shows it goes with clarity.
- Notes on signpost phrases ("the main reason is", "so in short").
- Pricing.
- Android launch.
