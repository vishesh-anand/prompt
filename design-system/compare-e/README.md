# Before and after mockups (step E3)

Made in Claude Design on 2026-11-12. Live canvas: https://claude.ai/artifact/DctvH8YGrgr7ffm9hCNXBf (private to the owner). It holds three first directions (A one timeline, B two columns, C sentences first) and the signed-off "C refined" board. These files are a copy of that board, taken at sign-off.

They are a picture to build from, not code to port. The rules are in DESIGN.md, "Before and after": build from that and the tokens in `app/src/design/`. The mockup is web markup with colours written out as hex; in the app every colour is a token, and standard controls are `@expo/ui` SwiftUI views.

| File | What |
|---|---|
| `Main.dc.html` | The board: six states, light and dark. Opens only in the canvas (it needs the canvas runtime). |
| `screens/*.png` | The same states as pictures: all six in light, states 2 and 3 in dark. |

The six states:
1. `1-met`: the tip worked (the point moved to the first sentence). Someone's first retry ever, so the practice line shows.
2. `2-closer`: the point came 25 seconds sooner but not in the first sentence ("Closer, not there yet").
3. `3-not-yet-third-try`: nothing moved, on a third try ("Compared with your first try").
4. `4-first-had-no-point`: the first try had no clear point; this one has one.
5. `5-not-measured`: the tip was about something this screen doesn't compare (an "um" tip), with "Play your second try".
6. `6-no-map`: the first try was mapped before this view existed.

How it was decided: the three directions were shown to five AI reviewer personas (a commuter for whom English is a second language, an anxious beginner, a sceptical director who cross-checks numbers, an older reader at large text with mild colour weakness, a heavy daily user). Four of five picked C. C was then refined over three review rounds, changing only what at least two reviewers raised at medium or high severity, until scores levelled off (6.6, 6.9, 6.8, then 8 and 7 on a final check of the changed states). These were AI personas, not real people: the "two or three real people look" check in the step E plan still applies.

Not in the mockups:
- The sample data is `app/src/features/compare/samples.ts` with the new rules applied by hand, plus two changes: the "Instruction met" retry has a short off-track step (the sample says 10% off track but had none), and the tips for states 4 and 5 are made up.
- Bar lengths after the last step are guesses: the samples' 40 seconds of speaking time is shorter than their steps.
- Large text, VoiceOver, Reduce Motion, numbers counting into place and the success haptic were not checked in the mockups.
