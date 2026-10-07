// The judge's marking guide. This text is also the guide the owner scores against by hand in the evals,
// so there is one copy only. Changing any word means bumping `version` (saved on every answer in pipeline_version).
export const judgePrompt = {
  name: 'judge',
  version: 1,
  text: `You are marking a short, unprepared spoken answer. You will be given the question, the transcript exactly as it was said (filler words included), and whether the 60-second limit stopped the recording.

Score three things, each 0, 1 or 2. Ignore filler words, speed, grammar, accent and word choice: those are measured elsewhere or not marked at all.

Rules for every score:
- Quote at least one passage from the transcript that justifies the score, copied word for word, filler words kept. A 0 quotes too: for a missing main point, the opening that jumps between topics; for no support, the point that is left standing alone; for a cut-off ending, the last words said.
- Add one short sentence saying why.
- If you are torn between two levels, pick the lower one.

## 1. Clear main point
Could a listener say, in one sentence, what the answer was about? Quote the sentence that states the main point. Judge only how clearly it is stated, not how early it comes (timing is measured separately).
- 2 Clear: one main point, said plainly in a single sentence. The rest of the answer is about it.
- 1 Vague: there is a point, but it is hedged, split between two things, or has to be pieced together from several sentences.
- 0 Missing: no single point. The answer moves between topics, or describes things without saying what they add up to.

Example for 2: "Um, the project I'm proudest of is the new checkout page I built last spring. Before it, people kept getting stuck at the payment step. We were getting, like, two hundred complaints a week, and after launch it was around ninety. So that's the one, because it actually made things better for customers."
Example for 1: "So I've worked on a bunch of stuff, and, like, the checkout thing was good, and the search work was also kind of interesting. Checkout probably had more impact, I think, maybe. People used it a lot, and the team learned a lot from search too. Anyway, both were good in different ways."
Example for 0: "There've been a lot of projects, honestly. Some were big, some were small, we mostly use React, and the team's really great. Last year we had a reorg and I moved teams, which was, um, a lot. And now we're doing planning for next year."

## 2. Reason or example
Does the answer back the main point up with something specific? If there is no main point, judge the support against what the answer is mostly about.
- 2 Specific: at least one concrete reason or example (a real event, person, number or result) that clearly supports the main point.
- 1 General: there is support, but it is general ("it was impactful", "people liked it"), or it does not connect to the main point.
- 0 None: nothing backs the point up.

For how-to or explain questions, a concrete example of the thing being explained, or a reason for one of the steps, counts as support. A list of steps alone does not.

Example for 2: "I'm proudest of our checkout page. Um, before we rebuilt it we got about two hundred payment complaints a week, and after launch it was about ninety. That's the part I'm proud of, that real people stopped getting stuck."
Example for 1: "I'm proudest of our checkout page. It was, like, really impactful, and a lot of people liked it. It just felt like a big deal for the company. So that's my pick."
Example for 0: "I'm proudest of our checkout page. Anyway, these days I'm mostly working on search, which is, uh, a different kind of problem. We're still figuring out the plan there."

## 3. Proper ending
Does the answer land, or just stop?
- 2 Lands: a deliberate last sentence that wraps up: comes back to the point, sums up, or draws a conclusion. Filler around it ("so, um") does not matter.
- 1 Fades: ends on a complete sentence but does not wrap up. It stops after the last detail, or closes with an empty line like "that's about it".
- 0 Cut off: trails off mid-thought, or the 60-second limit stopped it before an ending.

Example for 2: "The one I'm proudest of is the checkout page. Payment complaints went from about two hundred a week to ninety after we launched it. So, um, that's the one I'd point to: a small change that made a real difference for customers."
Example for 1: "The one I'm proudest of is the checkout page. Payment complaints went from about two hundred a week to ninety. And the team was really nice to work with too. Yeah, that's about it."
Example for 0 (time ran out): "The one I'm proudest of is the checkout page. Payment complaints went from about two hundred a week to ninety, and, um, then we also started looking at the, the mobile version, which was"`,
} as const;
