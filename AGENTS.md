# AGENTS.md

Guidance for AI agents working on ImpexTool.

## Stack and commands

Bun, Preact 11 with `@preact/signals`, TypeScript, biome, knip, `bun test` with happy-dom, `xlsx-js-style`.

    bun run check      lint + typecheck + knip + tests (run before finishing)
    bun run serve      build and serve http://localhost:8787
    bunx biome check --write .

## Architecture rules

- `src/core/` is pure: no DOM, no XLSX. It talks to the sheet only through `SheetPort` (get/setValue/setFormula/clear).
- The template is addressed by fixed column letters (`COL` in `src/core/sheet.ts`); only the FTA column is found by header (`FTACode`).
- State lives in `src/app/store.ts` as signals. Components read signals and call store functions.
- Every Apply re-parses the original file (`fillAndBuild` in `src/io/workbook.ts`); manual review edits are `overrides` applied last (`src/core/review.ts`).
- `server/handler.ts` is platform-free. Keep platform code in `server/serve.ts` and `functions/`.
- `shared/contract.ts` is the single source for API routes and wire types.

## Conventions

- Defaults (scheme, end use, payment status, reward, RoDTEP, FTA) are set in `EMPTY_FORM` in `store.ts`; a consistent value in the uploaded file wins.
- Add tests with behavior changes. Do not duplicate logic: check `src/core` before adding a helper.
- No stray files: knip must stay clean.

## Design

Dark theme default, light theme via `data-theme`. Tokens are CSS variables in `src/styles.css`. Icons are inline SVG. Keep the UI quiet and form-first; no decorative copy.

## Browser testing

Drive browsers only through `agent-browser` with its configured profile. Never launch `chromium`/`chrome` directly. Report failure instead of falling back. Run `agent-browser close` when done.

## Licensing

GPL-3.0-or-later. New files need no header; do not add code with an incompatible license.
