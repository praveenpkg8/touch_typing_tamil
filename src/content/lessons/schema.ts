/**
 * Lesson schema — see docs/design-freeze.md §5.
 * Validated at load time with Zod. Hard-fail on invalid lessons in dev.
 */

import { z } from 'zod';

export const LessonSchema = z.object({
  id: z.string().regex(/^L\d{2,3}-[a-z0-9-]+$/),
  schemaVersion: z.literal(1),
  level: z.number().int().min(1).max(7),
  type: z.enum(['char_drill', 'word', 'sentence', 'accuracy', 'speed']),
  title: z.object({
    ta: z.string().min(1),
    en: z.string().min(1),
  }),
  introducedGraphemes: z.array(z.string()),
  introducedKeys: z.array(z.string()),
  prerequisites: z.array(z.string()),
  drills: z
    .array(
      z.object({
        target: z.string().min(1),
        repeats: z.number().int().min(1).max(20).default(1),
      }),
    )
    .min(1),
  completion: z.object({
    minAccuracyGraphemes: z.number().min(0).max(100),
    minGPM: z.number().min(0),
  }),
  showComposition: z.enum(['always', 'on-error', 'never']).default('on-error'),
});

export type Lesson = z.infer<typeof LessonSchema>;

export interface LessonDrill {
  target: string;
  repeats: number;
}
