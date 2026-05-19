# Lesson content — authoring notes and review status

## Honesty up front

I authored L01–L21 from general Tamil knowledge, not from Tamil pedagogy
training or a published curriculum. The mechanical correctness (every word
is typeable on Tamil99, every grapheme is reachable from each lesson's
prerequisite chain) is solid because the conformance test and the validator
cover it. **The pedagogical and idiomatic correctness is "AI-authored, best
effort" and should be reviewed by a native Tamil speaker or a Tamil teacher
before this ships to learners.**

What follows is my self-review with explicit confidence levels.

## Confidence per lesson

| Lesson | Content type | Confidence | Notes |
|---|---|---|---|
| L01–L13 | Single graphemes only | **High** | These are pure layout drills (letter + repetition). No Tamil pedagogy required — they're mechanical. |
| L14 simple-words | Common short words | **High** | Words like நான், அது, மரம், கனி, மழை, நிலா are core vocabulary. Cross-checked spelling. |
| L15 family-words | Kinship terms | **Medium-high** | அப்பா, அம்மா, அண்ணன், அக்கா, தம்பி, தங்கை, மகன், மகள், பாட்டி, தாத்தா — all standard kinship terms. பாட்டி/தாத்தா are the common register; some families use alternates (e.g., ஆச்சி for grandmother) — review if regional variants matter. |
| L16 numbers | 1-10 cardinal numbers | **High** | ஒன்று through பத்து — standardized number words. |
| L17 greetings | Common phrases | **Medium** | வணக்கம், நன்றி, நலம், காலை, மாலை, நலமா — these are correct. கண்டிப்பாக ("definitely") is grammatically right but pedagogically demanding for L17 (long word, multiple consonant clusters). Consider replacing with something shorter for L17 and saving கண்டிப்பாக for L19. |
| L18 simple-sentences | First full sentences | **Medium** | All 4 sentences are grammatically correct. Updated sentence 3 to "நான் பள்ளிக்கு செல்கிறேன்" (was missing the dative case marker க்கு). The register is formal modern Tamil (-கிறேன், -கிறார் verb endings) — appropriate for written practice. |
| L19 complex-sentences | Longer sentences | **Medium** | Sentences are grammatically valid but reflect literary/written Tamil rather than spoken. Real-world use cases (chat, social media) would skew more colloquial. A Tamil teacher should decide whether L19 should add a colloquial-register sentence. |
| L20 speed-practice | Reused content for speed | **High** | Content is just repetition of earlier vocabulary for speed work. No new pedagogy decisions. |
| L21 accuracy-challenge | Reused content for accuracy | **High** | Same as L20 — mechanical, no new content decisions. |

## Specific items to flag for a Tamil reviewer

1. **Register consistency**: lessons mix formal written Tamil
   (e.g., பேசுகிறேன், இருக்கிறார்) with semi-colloquial (நலமா). This is
   intentional but should be reviewed against the target audience —
   e.g., a tutor for government-exam aspirants might want formal-only;
   one for general literacy might prefer mixed.

2. **Difficulty grading**: L18 and L19 are hand-classified as "simple" vs
   "complex". A frequency-based grading (word/grapheme frequency in a Tamil
   corpus) would be more rigorous. Out of scope for MVP but worth noting.

3. **Dialect/regional variants**: only one form is shown for each word.
   E.g., grandmother is பாட்டி here; ஆச்சி, ஆத்தா exist regionally. The
   author/teacher should decide whether to teach the "central" form
   (current default) or expose variants.

4. **Sentence content**: the sentences chosen ("I speak Tamil", "Mother is
   at home", "The Tamil language is very sweet") are pedagogically neutral
   and culturally non-controversial. They're not engaging — a Tamil teacher
   could craft sentences with more learner motivation (proverbs, song
   lyrics, simple riddles).

5. **No reading-difficulty progression beyond L19**: the curriculum stops
   at L21 (accuracy challenge). To extend further (paragraph-level practice,
   speed competition tiers, news/literature excerpts) requires Tamil corpus
   work and pedagogy decisions.

## Mechanical correctness (separate from pedagogy)

The following IS programmatically verified — no manual review needed:

- Every grapheme in every drill is reachable from the lesson's prerequisite
  chain (transitive closure of `introducedKeys`).
- Every keystroke sequence the user might use to produce a target is
  composer-correct (validated by the 680-fixture conformance test).
- Lesson schema (Zod) is validated at load time — invalid lessons fail
  fast in dev.

So a reviewer can focus 100% on pedagogy / idiom / cultural appropriateness
and trust that the engineering layer works.

## What would change with a real review

If a native Tamil teacher reviewed L14–L21, they might:

1. Replace 2–3 less-natural sentences in L18/L19 with more colloquial,
   idiomatic Tamil.
2. Add a register-marker per lesson (`register: 'formal' | 'colloquial' |
   'mixed'`) so the recommendation engine can match user preference.
3. Reorder L17 to put shorter common phrases first (e.g., வணக்கம், நன்றி
   before கண்டிப்பாக).
4. Add 3–5 more lessons covering: common verb conjugations, conversational
   sentences, simple proverbs.
5. Author a "Tamil 101" track separate from the typing track — i.e.,
   separate "learning the language" from "learning the keyboard."
