/**
 * GraphemeSegmenter — wraps Intl.Segmenter for Tamil grapheme clusters.
 *
 * The composer emits codepoints; downstream consumers (Validator, accuracy
 * metrics, cursor positioning) think in graphemes (uyirmei units). This
 * wrapper makes that conversion explicit, cacheable, and testable.
 *
 * Falls back to a hand-rolled segmenter on environments where Intl.Segmenter
 * isn't present (very old browsers). The fallback handles the Tamil cases
 * we care about: mei + pulli, mei + vowel-sign, plus ZWJ/ZWNJ as joiners.
 */

const HAS_INTL_SEGMENTER = typeof Intl !== 'undefined' && 'Segmenter' in Intl;

let cachedSegmenter: Intl.Segmenter | null = null;
function getIntlSegmenter(): Intl.Segmenter {
  if (cachedSegmenter === null) {
    cachedSegmenter = new Intl.Segmenter('ta', { granularity: 'grapheme' });
  }
  return cachedSegmenter;
}

/**
 * Segment a string into grapheme clusters.
 * Returns an array where each element is one grapheme (1+ codepoints).
 */
export function segmentGraphemes(s: string): string[] {
  if (s === '') return [];
  if (HAS_INTL_SEGMENTER) {
    const segmenter = getIntlSegmenter();
    const out: string[] = [];
    for (const { segment } of segmenter.segment(s)) out.push(segment);
    return out;
  }
  return fallbackSegment(s);
}

/**
 * Count graphemes without materializing the array. Marginally faster on
 * hot paths (per-keystroke cursor updates).
 */
export function countGraphemes(s: string): number {
  if (s === '') return 0;
  if (HAS_INTL_SEGMENTER) {
    let n = 0;
    for (const _ of getIntlSegmenter().segment(s)) n++;
    return n;
  }
  return fallbackSegment(s).length;
}

/**
 * Hand-rolled Tamil grapheme segmenter for environments without
 * Intl.Segmenter. Rules:
 *   - A mei (U+0B95–0BB9) starts a new cluster.
 *   - A pulli (U+0BCD), vowel sign (U+0BBE–0BCC), ZWJ (U+200D), or ZWNJ
 *     (U+200C) extends the current cluster.
 *   - Anything else is its own cluster.
 *
 * This is a simplification but matches Intl.Segmenter for every fixture
 * in keymap.fixtures.json.
 */
function fallbackSegment(s: string): string[] {
  const out: string[] = [];
  let current = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const extender =
      cp === 0x0BCD ||                       // pulli
      (cp >= 0x0BBE && cp <= 0x0BCC) ||      // vowel signs
      cp === 0x200C || cp === 0x200D;        // ZWNJ / ZWJ
    if (extender && current !== '') {
      current += ch;
    } else {
      if (current !== '') out.push(current);
      current = ch;
    }
  }
  if (current !== '') out.push(current);
  return out;
}
