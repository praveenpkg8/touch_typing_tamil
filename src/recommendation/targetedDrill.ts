/**
 * Targeted drill generator — given a list of weak graphemes (typically 1-5
 * picked by the recommendation engine), produce a practice string that
 * exercises each via spaced repetition.
 *
 * The output structure is deliberately simple and predictable so users can
 * see the same "blocks then mixed" pattern across drills and build
 * expectation rhythm:
 *
 *   block phase: G1 G1 G1 G2 G2 G2 G3 G3 G3
 *   mixed phase: G1 G2 G3 G3 G2 G1 G1 G3 G2
 *
 * Spaces between graphemes act as natural breath markers and force the
 * composer to commit state between attempts. This is desirable for muscle
 * memory: each grapheme is produced from a clean state.
 */

export interface TargetedDrillOptions {
  /** Graphemes the user struggles with, ordered by priority (most-struggling first). */
  weakGraphemes: string[];
  /** How many times each grapheme is repeated in the block phase. Default 3. */
  blockRepeats?: number;
  /** How many mixed rounds after the block phase. Default 3. */
  mixedRounds?: number;
}

export interface TargetedDrill {
  /** The practice string to type. */
  target: string;
  /** Graphemes that were actually included (input may be filtered). */
  graphemes: string[];
}

const MAX_GRAPHEMES = 5;

export function generateTargetedDrill(opts: TargetedDrillOptions): TargetedDrill {
  const blockRepeats = opts.blockRepeats ?? 3;
  const mixedRounds = opts.mixedRounds ?? 3;

  // Keep top-N, deduplicate, drop empties.
  const seen = new Set<string>();
  const graphemes: string[] = [];
  for (const g of opts.weakGraphemes) {
    if (!g || seen.has(g)) continue;
    seen.add(g);
    graphemes.push(g);
    if (graphemes.length >= MAX_GRAPHEMES) break;
  }

  if (graphemes.length === 0) {
    return { target: '', graphemes: [] };
  }

  const parts: string[] = [];

  // Block phase: G G G  G G G  G G G
  for (const g of graphemes) {
    for (let i = 0; i < blockRepeats; i++) parts.push(g);
  }

  // Mixed phase: interleaved permutations. Deterministic seeded shuffle
  // (LCG) keeps drill output reproducible for the same input — useful for
  // testing and for users who notice "I got the same drill twice in a row."
  let seed = stringHash(graphemes.join('|')) >>> 0;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };

  for (let round = 0; round < mixedRounds; round++) {
    const shuffled = [...graphemes];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    parts.push(...shuffled);
  }

  return {
    target: parts.join(' '),
    graphemes,
  };
}

function stringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}
