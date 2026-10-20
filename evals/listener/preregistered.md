# Listener check: what we test, decided before any rating

Written on 2026-10-18, before any friend rated a clip. Don't change this file after the main round starts. A test added later has to be reported as found afterwards, not planned in advance.

## The four measures

ARCHITECTURE.md names these in advance. Each is tested against the friends' **mean effort** for a clip (1 = no effort at all, 5 = hard work), on the main-round first tries only:

| Measure | Comes from | Expected direction |
|---|---|---|
| Seconds to the point (the first Direction or Point step) | Map (step C) | Later point, more effort |
| Off-track time (share of the answer in Off track steps) | Map (step C) | More off-track, more effort |
| Vague words a minute | Measure (step B) | More vague words, more effort |
| "And" chaining (additive "and" per 100 words) | Measure (step B) | More chaining, more effort |

## The test

- Spearman correlation between the measure and mean effort, with a 95% range from resampling clips (`bootstrap` in `evals/listenerStats.ts`, 2000 resamples, seed 1).
- A measure **goes with "easier to follow"** only if its whole range is above 0 (in the expected direction).
- A measure whose range includes 0 is **not shown yet**. It is not proven useless: clips from one speaker may not vary enough.
- No other measure is promoted on this data. Anything else that looks related is a lead for the next round, not a result.

## What this panel can and can't show

- About 28 clips from one speaker. Only a correlation of about r ≥ .40 clears chance at the 5% level. Smaller real effects will be missed.
- The friends' agreement (ICC) comes first. If the low end of the panel average's range is below .50, the effort scores are too noisy to test anything, and the result is "ran, inconclusive".
- Pairs: the retry is expected to be picked more often. That's practice, since a second try is easier, and it is reported as practice, not as progress.

## The AI checks (step C), also fixed now

- **Point:** each friend's sentence and the AI restatement are marked "same claim as I meant" (yes or no) by the owner. The owner writes what they meant before reading anyone's answer. The AI's match rate is compared with the friends'.
- **Effort and labels:** the AI is compared with the panel average using quadratic-weighted kappa, not plain percent agreement.
