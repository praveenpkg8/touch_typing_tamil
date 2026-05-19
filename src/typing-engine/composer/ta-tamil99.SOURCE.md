# ta-tamil99.mim — Source Provenance

This file documents where `ta-tamil99.mim` was obtained. Used by humans reviewing whether to pull a newer upstream version. The machine-readable identity (SHA-256) lives in `keymap.json` and is what CI parity tests against.

## Upstream

- **Repository:** https://git.savannah.nongnu.org/git/m17n/m17n-db.git
- **Original path within repo:** `MIM/ta-tamil99.mim`
- **Repo commit at time of pull:** `486a5537315d4e0f58e65b691947222b53689dd2`
- **File last modified upstream:** 2026-04-07 10:18:59 +0200
- **Pulled on:** 2026-05-19
- **File SHA-256:** `93615533b7554fe0afe4f3c0e67b294e74fe485747b5c48a30772bdf9654aeb4`

## License

m17n-db is licensed under the GNU Lesser General Public License (LGPL) v2.1 or later. See the file header for the full notice. The .mim file itself is © 2006, 2010 Red Hat, Inc. with contributions from I. Felix, Srikanth L, and thesupertechie. Their contribution history is preserved in the file header comments.

## Pulling a newer version

```sh
cd /tmp && rm -rf m17n-db
git clone --depth 1 https://git.savannah.nongnu.org/git/m17n/m17n-db.git
cp m17n-db/MIM/ta-tamil99.mim <this directory>/ta-tamil99.mim

# Update this file with new commit / date / sha256
cd m17n-db
git rev-parse HEAD
git log -1 --format='%ai' -- MIM/ta-tamil99.mim
sha256sum MIM/ta-tamil99.mim
```

Then run the parser script (`pnpm tsx scripts/mim-to-json.ts`) and inspect the diff in `keymap.json` and `keymap.fixtures.json`. The CI parity test will fail until the regenerated files are committed.

## What the .mim encodes

The m17n Tamil99 input method enumerates ~600 keystroke sequences. Single-key entries are atomic Tamil character emissions; multi-key entries (2–4 keys) encode pre-computed composition outputs:

- `("hf" "க்")` — h then f → consonant + pulli
- `("hq" "கா")` — h then q → consonant + aa vowel sign
- `("hh" "க்க")` — h then h → auto-pulli on gemination

For our typing tutor, the single-key entries become the **atomic keymap** the composer reads at runtime; the multi-key entries become **conformance fixtures** validating that our rule-based composer produces the same outputs m17n does. See `docs/design-freeze.md` §7 and §8 for the composer contract and keymap schema.

## Known upstream typos

These entries in the .mim diverge from the pattern of their siblings in ways consistent with copy-paste errors during authoring. Our rule-based composer produces what the consistent pattern would produce. The conformance test (`scripts/test-composer-conformance.ts`) treats these as known divergences and does not fail on them.

| .mim line | Sequence | .mim output | Pattern-correct output | Why we believe it's a typo |
|---|---|---|---|---|
| 540 | `TTq` (shift-T, shift-T, q) | `க்ஷ்க்ஷ` | `க்ஷ்க்ஷா` | Every other `TT<vowel>` entry includes the vowel sign substitution (TTs → க்ஷ்க்ஷி, TTw → க்ஷ்க்ஷீ, TTd → க்ஷ்க்ஷு, TTe → க்ஷ்க்ஷூ). Only TTq is missing the trailing ா. Looks like the author copy-pasted TT's output without modifying. |
| 632 | `RRd` (shift-R, shift-R, d) | `ஹ்ஹி` | `ஹ்ஹு` | KeyD maps to உ (whose vowel sign is ு). Every other `XXd` entry produces the ு sign. RRd produces ி (vowel sign for இ, which is on KeyS) — almost certainly a sibling-row copy-paste from `XXs`. |

If these get fixed upstream we'll see the conformance test pick up two more passes after a re-pull.

## Non-standard m17n syntax used

- `?CHAR` — character literal (e.g., `?ஆ` is the codepoint of ஆ).
- `(G-x)` — AltGr+x. m17n's notation for the third layer; corresponds to `event.altKey` (or `AltRight` depending on the platform).
- Multi-character key strings — e.g., `("hfW" "க்‌ஷ")` is the three-keystroke sequence h, f, shift-W producing the non-conjunct form of க்‌ஷ.
