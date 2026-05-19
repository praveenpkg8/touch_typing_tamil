/**
 * Recommendation types — the engine returns a tagged union so the UI can
 * render each kind specifically (different action button, different reason
 * line). See docs/design-freeze.md §11.
 */

export type Recommendation =
  | {
      kind: 'start-first';
      lessonId: string;
      reason: string;
    }
  | {
      kind: 'next-lesson';
      lessonId: string;
      reason: string;
    }
  | {
      kind: 'retry-lesson';
      lessonId: string;
      reason: string;
    }
  | {
      kind: 'targeted-drill';
      weakGraphemes: string[];
      reason: string;
    }
  | {
      kind: 'refresher';
      lessonId: string;
      reason: string;
    }
  | {
      kind: 'all-done';
      reason: string;
    };
