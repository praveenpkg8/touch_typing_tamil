/**
 * Lesson loader — explicitly imports every L*.json file and validates each
 * with Zod at load time.
 *
 * To add a new lesson: drop a `L<NN>-<slug>.json` file in this folder and
 * add an import + RAW_LESSONS entry below. Validation is enforced at load,
 * so a bad lesson file fails fast.
 */

import { LessonSchema, type Lesson } from './schema.ts';
import L01 from './L01-home-row-mei.json' with { type: 'json' };
import L02 from './L02-home-row-uyir.json' with { type: 'json' };
import L03 from './L03-uyirmei-intro.json' with { type: 'json' };
import L04 from './L04-top-row-uyir.json' with { type: 'json' };
import L05 from './L05-long-uyirmei.json' with { type: 'json' };
import L06 from './L06-bottom-row-uyir.json' with { type: 'json' };
import L07 from './L07-full-uyirmei-matrix.json' with { type: 'json' };
import L08 from './L08-top-row-mei.json' with { type: 'json' };
import L09 from './L09-pulli.json' with { type: 'json' };
import L10 from './L10-gemination.json' with { type: 'json' };
import L11 from './L11-soft-hard-pairs.json' with { type: 'json' };
import L12 from './L12-bottom-mei-left.json' with { type: 'json' };
import L13 from './L13-bracket-mei.json' with { type: 'json' };
import L14 from './L14-simple-words.json' with { type: 'json' };
import L15 from './L15-family-words.json' with { type: 'json' };
import L16 from './L16-numbers.json' with { type: 'json' };
import L17 from './L17-greetings.json' with { type: 'json' };
import L18 from './L18-simple-sentences.json' with { type: 'json' };
import L19 from './L19-complex-sentences.json' with { type: 'json' };
import L20 from './L20-speed-practice.json' with { type: 'json' };
import L21 from './L21-accuracy-challenge.json' with { type: 'json' };

const RAW_LESSONS: unknown[] = [
  L01, L02, L03, L04, L05, L06, L07, L08, L09, L10, L11,
  L12, L13, L14, L15, L16, L17, L18, L19, L20, L21,
];

function loadLessons(): Lesson[] {
  const out: Lesson[] = [];
  for (const raw of RAW_LESSONS) {
    const result = LessonSchema.safeParse(raw);
    if (!result.success) {
      const id = (raw as { id?: unknown })?.id ?? '<unknown>';
      throw new Error(
        `Invalid lesson ${JSON.stringify(id)}: ${result.error.message}`,
      );
    }
    out.push(result.data);
  }
  return out.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
}

export const LESSONS: Lesson[] = loadLessons();

export function getLessonById(id: string): Lesson | undefined {
  return LESSONS.find(l => l.id === id);
}

export { LessonSchema };
export type { Lesson, LessonDrill } from './schema.ts';
