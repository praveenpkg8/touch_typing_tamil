# Tamil99 Typing Tutor

A privacy-first Tamil typing tutor for the **Tamil99 keyboard layout**.
Runs entirely in the browser — no accounts, no backend, no data leaves
your device.

**Live:** https://touchtypingtamil.netlify.app/

---

## Features

- Visual Tamil99 keyboard with finger-zone tinting and next-key prediction
- Real-time validation with a 9-kind mistake taxonomy
- **21 lessons** progressing from key drills (home/top/bottom rows, pulli,
  gemination, soft-hard pairs) through words, family terms, numbers,
  greetings, and full sentences — ending with speed and accuracy challenges
- **Custom practice** — paste any Tamil text and drill it
- **Targeted drills** — the recommendation engine generates spaced-repetition
  exercises for graphemes you struggle with
- **Dashboard** with trend sparklines, weak-grapheme cloud, and lesson grid
- **Settings**: sound feedback, error highlighting, JSON export/import,
  reset progress

## Privacy

Everything is stored locally in IndexedDB on the device you used. There are
no accounts, no analytics, no server. The Settings → Export action backs up
your progress as JSON; Import restores it on another device.

## Tech stack

- React 19 · Vite 8 · TypeScript 5 (strict)
- Tailwind v4 · Zustand
- Dexie (IndexedDB), `uuidv7` IDs (sync-ready schema)
- Zod for content + import validation
- Web Audio for optional key-click feedback
- m17n `ta-tamil99.mim` as the canonical Tamil99 source

## Local development

Requires Node 22+.

```sh
npm install
npm run dev              # http://localhost:5173
npm run build            # production bundle into dist/
npm run preview          # preview the production build locally
npm run typecheck
```

## Tests

```sh
npm run test:all                # full suite (727 cases)

npm run composer:conformance    # 680 fixtures auto-extracted from m17n
npm run validator:integration   # 9 end-to-end composer + validator cases
npm run predict:tests           # 10 next-key prediction cases
npm run recommendation:tests    # 14 recommendation + drill cases
npm run hysteresis:tests        # 14 recommendation-stability cases
```

The composer is **provably equivalent to m17n's Tamil99 input method** for
every well-formed sequence in `ta-tamil99.mim`, modulo two documented
upstream typos (see `src/typing-engine/composer/ta-tamil99.SOURCE.md`).

## Re-pulling the Tamil99 spec

The `.mim` source is committed locally. If upstream changes,
`npm run mim:build` regenerates `keymap.json` and `keymap.fixtures.json`,
and `npm run mim:check` is the CI parity gate.

## Deploy

`netlify.toml` is configured for Netlify static hosting (Node 22, SPA
fallback, security headers, asset cache rules). The same `dist/` output
deploys identically on Vercel, Cloudflare Pages, Firebase Hosting, and
GitHub Pages.

## Docs

| File | Purpose |
|---|---|
| `docs/design-freeze.md` | Engineering contract — architecture, data model, composer state machine + rules, recommendation engine spec |
| `src/typing-engine/composer/ta-tamil99.SOURCE.md` | Upstream m17n provenance, license, known typos |
| `src/content/lessons/CONTENT-NOTES.md` | Tamil content authoring notes and pedagogical confidence per lesson |

## License

The Tamil99 layout data (`src/typing-engine/composer/ta-tamil99.mim`) is
from the m17n project and remains under **LGPL v2.1 or later**, with the
original copyright preserved. The application code in this repo has no
explicit license declared yet — choose and add one before publishing more
widely.
