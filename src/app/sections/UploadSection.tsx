import { useEffect, useRef, useState } from "preact/hooks";
import { analyzePaste } from "../../core/paste";
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

interface PastePanelProps {
  text: string;
  onChange: (text: string) => void;
  onClose: () => void;
}

/** A box for a table copied from Excel. Headers are matched to template columns as you paste. */
function PastePanel({ text, onChange, onClose }: PastePanelProps) {
  const box = useRef<HTMLTextAreaElement>(null);
  const analysis = analyzePaste(text);
  const empty = text.trim() === "";
  const ready = analysis.error === null;

  useEffect(() => {
    box.current?.focus();
  }, []);

  const submit = () => {
    if (ready) void s.loadPasted(text);
  };

  return (
    <section className="paste-panel" aria-labelledby="paste-title">
      <header className="sheet-head">
        <h2 id="paste-title">Paste a table</h2>
        <button type="button" className="link small" onClick={onClose}>
          Cancel
        </button>
      </header>
      <p className="muted small">
        Copy the header row and the rows from Excel. A column named HSN or RITCCode is required.
      </p>
      <label className="sr-only" htmlFor="paste-box">
        Table to paste
      </label>
      <textarea
        ref={box}
        id="paste-box"
        className="paste-box"
        rows={8}
        spellcheck={false}
        placeholder={"ItemSNo\tDescription\tHSN\tQuantity\tUnit\n1\tBicycle mirror\t7009\t10\tNOS"}
        value={text}
        onInput={(e) => onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        aria-describedby="paste-status"
      />
      <div id="paste-status" className="paste-status" aria-live="polite">
        {empty ? (
          <p className="muted small">The first row should name the columns.</p>
        ) : analysis.error ? (
          <p className="field-msg err">{analysis.error}</p>
        ) : (
          <>
            <p className="small">
              <strong>{analysis.rows.length}</strong> row(s) ·{" "}
              {analysis.columns.map((c) => c.label).join(", ")}
            </p>
            {analysis.ignored.length > 0 && (
              <p className="muted small">Not used: {analysis.ignored.join(", ")}</p>
            )}
          </>
        )}
      </div>
      <div className="paste-actions">
        <button type="button" className="btn primary" disabled={!ready} onClick={submit}>
          Use pasted table
        </button>
      </div>
    </section>
  );
}

const GHOST_ROWS = ["Scheme code", "End use", "IGST payment status", "Reward item"];

/** First screen: the sheet as it will look, inert, with one large target for the file. */
export function UploadHero() {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");

  // Copying a table and pressing Ctrl+V on the landing screen opens the paste box directly.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("textarea, input")) return;
      const pasted = e.clipboardData?.getData("text/plain") ?? "";
      if (!pasted.includes("\t")) return;
      e.preventDefault();
      setText(pasted);
      setPasting(true);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const close = () => {
    setPasting(false);
    setText("");
  };

  return (
    <section className="landing-sheet" aria-labelledby="hero-title">
      <h2 id="hero-title">Fill a ProductFormat.xlsx</h2>
      <label className="drop">
        <FileInput />
        <strong>Drop ProductFormat.xlsx here</strong>
        <span className="muted">or click to choose. The file stays in your browser.</span>
      </label>
      {pasting ? (
        <PastePanel text={text} onChange={setText} onClose={close} />
      ) : (
        <p className="paste-open muted small">
          or{" "}
          <button type="button" className="link" onClick={() => setPasting(true)}>
            paste a table copied from Excel
          </button>
        </p>
      )}
      <LoadError />
      {!pasting && (
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
      )}
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
  const codes = Object.keys(s.index.value?.rowsByRitc ?? {}).length;
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
