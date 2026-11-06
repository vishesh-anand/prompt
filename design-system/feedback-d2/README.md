# Feedback screen mockups (step D2)

Made in Claude Design on 2026-11-06 and 2026-11-07, after four rounds of review. Live canvas: https://claude.ai/artifact/KtuV1eFKmnUKCbgEY5c4nT (private to the owner). These files are a copy of round 4, taken when the design was signed off.

They are a picture to build from, not code to port. The rules are in DESIGN.md, "Feedback reveal": build from that and the tokens in `app/src/design/`. The mockups are web markup with colours written out as hex; in the app every colour is a token, and standard controls are `@expo/ui` SwiftUI views.

| File | Screen |
|---|---|
| `Main.dc.html` | The feedback screen, light. A Work answer that found its point late. Try again is pinned outside the scroll. |
| `Built.dc.html` | Step by step sheet, opened from the answer line. |
| `Tighter.dc.html` | Shorter and clearer sheet. |
| `Sounded.dc.html` | How it sounded sheet. |
| `Story.dc.html` | The feedback screen, dark. An Everyday story that made its point. |
| `StoryBuilt.dc.html` | Its Step by step sheet, dark. |
| `Arriving.dc.html` | While the tip is still being written. |

Not in the mockups:
- On `Story.dc.html` the "Shorter and clearer" and "How it sounded" rows open nothing; they open their sheets in the app, as on `Main.dc.html`.
- The wording is sample text. Some of it differs from what the coach writes today; see FOLLOWUPS.md, "Step D2".
- Large text, VoiceOver and Reduce Motion were not checked in the mockups.
