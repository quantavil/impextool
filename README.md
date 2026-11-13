# ImpexTool

Fills the `ProductFormat.xlsx` template for Indian export shipping-bill filing. It is a standalone rewrite of an earlier Tampermonkey userscript. The workbook is read and written in the browser. The server only proxies the duty lookup, and only HSN codes are sent to it.

## What it does

1. Upload the ProductFormat `.xlsx`. Rows and HSN codes are detected.
2. Set the shipment fields. Defaults: Scheme `19-Drawback (DBK)`, End use `GNX100`, IGST payment status `LUT`, Reward item `Yes`, RoDTEP `N/A`, FTA code `NCPTI`. Values already consistent in the file take priority over the defaults.
3. Fetch duty data per HSN, choose a DBK option where several apply, and set IGST per HSN when payment status is `P`.
4. Apply and fill. The form is replaced by an editable sheet so you can check the result and edit any cell. Back returns to the form with your edits kept.
5. Download the filled `.xlsx`.

## Output rules

- Every Apply starts from a fresh parse of the uploaded file, so changing a choice and applying again never keeps values from an earlier fill. Manual edits are re-applied on top.
- RoDTEP (column AJ) is asked as `Yes` or `No` (default `Yes`) and written on every matched row. A `Yes` becomes `N/A` on rows whose HS code has no RoDTEP entry in ImpexCube.
- Drawback columns (U to X) are filled only for Drawback schemes and are cleared on matched rows otherwise. Rows without duty data keep their file values.
- The FTA code is written to the column whose header is `FTACode`.
- The template's `RoDTEPQty` column (AK) is removed from the filled file when its header matches.
- The download name uses local date and time.

## Layout

    src/app/            UI: store (Preact signals), ui.tsx (Combobox, Segmented, Field, Sheet), App
    src/app/sections/   one file per section, plus the Dock (actions) and ActivityLog
    src/core/           pure logic: fill rules, DBK planning, rates, scanning, review edits (no DOM, no XLSX)
    src/io/             XLSX adapter (loaded on demand) and browser API client
    src/data/           country, state/district, scheme, end-use and FTA code tables
    shared/             API routes and wire types used by server and browser
    server/             handler.ts: plain Web Request -> Response, no platform imports
                        impexcube.ts: upstream calls and field allow-list
                        serve.ts: Bun adapter for local runs and self-hosting
    functions/          Cloudflare Pages catch-all adapter for /api/*
    scripts/            clean.ts empties dist/ before each build
    test/               unit, workbook round trip, server, DOM, duty-lookup race

## Commands

    bun install
    bun run serve      build, then http://localhost:8787 (site and API)
    bun run check      biome + tsc + knip + tests
    bun run build      static site in dist/

## Deploy to Cloudflare Pages

- Framework preset: None
- Build command: `bun run build`
- Build output directory: `dist`

Pages installs dependencies from `bun.lock` on its own. If its Bun is too old, set the environment variable `BUN_VERSION` to `1.4.4`.

Pages picks up `functions/` automatically. Other hosts: serve the static `dist/` and call `handleApi(request)` from `server/handler.ts` for `/api/*`.

## Upstream dependency

Duty data and exchange rates come from impexcube.in. The server has no login session, so confirm the lookup works without one:

    POST https://impexcube.in/DutyStructureExport/FillDescription
    {"RITC":"9403","Country":"null","Mode":"Description"}

If it returns a login page, the lookup reports "did not return JSON (is a login required?)". ImpexTool is an independent project, not affiliated with that service.

## Security

- The API accepts only POST, and an HSN made of digits and dots. Upstream URLs are fixed.
- Duty responses are cut down to the fields the app reads. Exchange rates pass through unchanged and are validated in the browser.
- There is no built-in rate limit. Add one at the host (Cloudflare: a rate-limiting rule on `/api/*`).

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
