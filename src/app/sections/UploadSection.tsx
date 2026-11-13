import type { Loaded } from "../../io/workbook";
import * as s from "../store";

function FileInput() {
  return (
    <input
      type="file"
      accept=".xlsx,.xls"
      className="sr-only"
      onChange={(e) => {
        const input = e.currentTarget;
        const file = input.files?.[0];
        // Reset so choosing the same file again (after editing it) still fires a change.
        input.value = "";
        if (file) void s.loadFile(file);
      }}
    />
  );
}

export function LoadError() {
  const message = s.loadError.value;
  return message ? (
    <p className="alert err" role="alert">
      {message}
    </p>
  ) : null;
}

const GHOST_ROWS = ["Scheme code", "End use", "IGST payment status", "Reward item"];

/** First screen: the sheet as it will look, inert, with one large target for the file. */
export function UploadHero() {
  return (
    <section className="landing-sheet" aria-labelledby="hero-title">
      <h2 id="hero-title">Fill a ProductFormat.xlsx</h2>
      <label className="drop">
        <FileInput />
        <strong>Drop ProductFormat.xlsx here</strong>
        <span className="muted">or click to choose. The file stays in your browser.</span>
      </label>
      <LoadError />
      <div className="ghost" aria-hidden="true">
        <div className="sheet-head">
          <h2>Shipment</h2>
        </div>
        {GHOST_ROWS.map((r) => (
          <div className="ghost-row" key={r}>
            <span>{r}</span>
            <i />
          </div>
        ))}
        <div className="sheet-head">
          <h2>HSN codes</h2>
        </div>
        {[0, 1, 2].map((n) => (
          <div className="ghost-row" key={n}>
            <span>&nbsp;</span>
            <i />
          </div>
        ))}
      </div>
    </section>
  );
}

const ICON = {
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 1.8,
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "aria-hidden": true,
} as const;

/** Loaded file name and a quiet replace action, for the top bar. */
export function FileSummary({ wb }: { wb: Loaded }) {
  const codes = Object.keys(wb.index.rowsByRitc).length;
  return (
    <div className="file">
      <span className="file-name" title={wb.fileName}>
        {wb.fileName}
      </span>
      <span className="muted small file-meta">
        {wb.index.dataRows.length} rows · {codes} HSN
      </span>
      <label className="icon-btn" title="Replace file">
        <svg viewBox="0 0 24 24" width="18" height="18" {...ICON}>
          <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
        <span className="sr-only">Replace file</span>
        <FileInput />
      </label>
    </div>
  );
}
