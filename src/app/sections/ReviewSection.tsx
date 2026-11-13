import { useComputed } from "@preact/signals";
import { type ReviewColumn } from "../../core/review";
import { cell } from "../../core/sheet";
import * as s from "../store";
import { Sheet, type StepStatus } from "../ui";

/** Arrow keys move between rows in the same column, so a column can be reviewed without the mouse. */
function onCellKey(e: KeyboardEvent, current: string): void {
  const input = e.currentTarget as HTMLInputElement;
  if (e.key === "Escape") {
    e.preventDefault();
    input.value = current;
    return;
  }
  const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
  if (step === 0) return;
  e.preventDefault();
  const tr = input.closest("tr");
  const sibling = step > 0 ? tr?.nextElementSibling : tr?.previousElementSibling;
  const index = Array.prototype.indexOf.call(tr?.children ?? [], input.closest("td"));
  sibling?.children[index]?.querySelector("input")?.focus();
}

function ResetIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

interface CellProps {
  col: ReviewColumn;
  row: number;
  filled: string;
  fillChanged: boolean;
}

function ReviewCell({ col, row, filled, fillChanged }: CellProps) {
  const address = cell(col.col, row);
  const label = `${col.col} row ${row}`;
  // Reading one entry through a computed keeps an edit from re-rendering every cell.
  const edit = useComputed(() => s.overrides.value[address]).value;
  const edited = edit !== undefined;
  const shown = edit ?? filled;
  const state = edited ? "edited" : fillChanged ? "filled" : undefined;
  return (
    <td className={`rv-cell${col.text ? " text" : ""}${state ? ` ${state}` : ""}`}>
      <input
        aria-label={label}
        value={shown}
        spellcheck={false}
        autoComplete="off"
        title={edited ? "Edited by you" : fillChanged ? "Filled by the tool" : undefined}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => s.setOverride(address, e.currentTarget.value)}
        onKeyDown={(e) => onCellKey(e, shown)}
      />
      {edited && (
        <button
          type="button"
          className="rv-reset"
          aria-label={`Reset ${label}`}
          title="Reset to the filled value"
          onClick={() => s.resetOverride(address)}
        >
          <ResetIcon />
        </button>
      )}
    </td>
  );
}

function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

/** The filled data rows, editable before download. Edits live in the store and are written over the fill. */
export function ReviewSection() {
  const r = s.review.value;
  const edits = Object.keys(s.overrides.value).length;
  if (!r) return null;

  const status: StepStatus = {
    tone: "muted",
    text: `${r.rows.length} row${r.rows.length === 1 ? "" : "s"}${edits > 0 ? `, ${edits} edited` : ""}`,
  };

  return (
    <div className="rv-view">
      <button type="button" className="rv-back" onClick={s.backToForm}>
        <BackIcon />
        Back to form
      </button>
      <Sheet id="review" title="Review result" status={status}>
        <div className="sheet-tools">
          <p className="muted small rv-legend">
            <span className="rv-key filled" aria-hidden="true" />
            Filled
            <span className="rv-key edited" aria-hidden="true" />
            Edited by you
          </p>
          {edits > 0 && (
            <p className="muted small" role="status">
              {edits} manual edit{edits === 1 ? "" : "s"} kept
            </p>
          )}
        </div>
        <div className="rv-scroll" role="region" aria-label="Filled rows" tabIndex={0}>
          <table className="rv-table">
            <thead>
              <tr>
                <th scope="col" className="rv-row">
                  Row
                </th>
                {r.columns.map((c) => (
                  <th key={c.col} scope="col" className={c.text ? "text" : undefined}>
                    <span className="rv-letter">{c.col}</span>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row) => (
                <tr key={row}>
                  <th scope="row" className="rv-row">
                    {row}
                  </th>
                  {r.columns.map((c) => {
                    const a = cell(c.col, row);
                    const filled = r.after[a] ?? "";
                    return (
                      <ReviewCell
                        key={c.col}
                        col={c}
                        row={row}
                        filled={filled}
                        fillChanged={filled !== (r.before[a] ?? "")}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sheet>
    </div>
  );
}
