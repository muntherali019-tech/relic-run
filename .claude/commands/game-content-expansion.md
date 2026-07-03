---
description: Expand offline question banks and curriculum coverage with quality gates
---

Expand the game's learning content while keeping quality measurable.

1. Offline bank (src/data/bank.js): the README targets 12–14 fallback questions per subject. Audit actual counts per stage/subject/topic; top up thin areas to at least 15 so a full offline round never repeats. Match the existing entry shape exactly, keep age-appropriate UK curriculum wording, and ensure exactly one correct answer per question with plausible distractors.
2. Curriculum map (src/data/curriculum.js): check topics per stage/subject against the UK national curriculum headings; add missing high-value topics (each new topic needs bank questions and a tutor-prompt line so AI generation works for it).
3. Courses (src/data/courses.js): verify module lists are coherent and exam configs reference real modules.
4. Quality gates: write a small validation script (node, no deps) asserting every bank entry parses, has 4 options, a valid answer index, and no duplicate question text; run it and wire it into the test script if one exists.
5. Every claim about coverage in README.md must remain true after the change — update the numbers.

Report counts per stage/subject before/after and the validator output.
