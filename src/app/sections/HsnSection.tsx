import type { DbkOption } from "../../core/duty";
import { FIELD, isDrawbackScheme } from "../../core/fill";
import { IGST_PERCENTS } from "../../core/rates";
import type { Option } from "../../data/geo";
import type { Loaded } from "../../io/workbook";
import * as s from "../store";
import { Combobox, Segmented, Sheet, type StepStatus } from "../ui";

const IGST_OPTIONS = IGST_PERCENTS.map((p) => ({ value: String(p), label: `${p}%` }));
const STATUS_TEXT: Record<s.DutyStatus, string> = { ok: "Matched", "no-data": "No data", failed: "Failed" };

const rateText = (e: DbkOption): string => `${e.rate}${e.unit ? `/${e.unit}` : ""}`;
const toOption = (e: DbkOption, i: number): Option => ({
  value: String(i),
  label: `${e.srNo} · ${rateText(e)}`,
  detail: e.desc || "no description",
});

/** Duty lookup, Drawback choice and IGST rate for each HSN code, one row per code. */
export function HsnSection({ wb }: { wb: Loaded }) {
  const f = s.form.value;
  const scheme = f.scheme.trim();
  const drawback = isDrawbackScheme(scheme);
  const paid = f.paymentStatus === "P";
  const progress = s.dutyProgress.value;
  const status = s.dutyStatus.value;
  const plan = s.plan.value;
  const codes = Object.entries(wb.index.rowsByRitc);
  const looked = Object.keys(status).length > 0;
  const fetched = Object.keys(s.duty.value).length > 0;
  const matched = codes.filter(([c]) => status[c] === "ok").length;
  const open = s.pendingIn("dbk", "igst");
  const error = (id: string) => (s.showErrors.value ? s.blockerById.value[id] : undefined);

  let state: StepStatus = { tone: "warn", text: "Duty data not fetched" };
  if (progress) state = { tone: "muted", text: `Fetching ${progress.done} of ${progress.total}` };
  else if (looked) {
    if (open > 0) state = { tone: "warn", text: `${open} open` };
    else
      state = {
        tone: matched === codes.length ? "ok" : "warn",
        text: `${matched} of ${codes.length} matched`,
      };
  }

  const dbkCell = (ritc: string) => {
    if (scheme === "") return <span className="faint">Choose a scheme first</span>;
    if (!drawback) return <span className="faint">Scheme has no Drawback</span>;
    if (!fetched) return <span className="faint">After duty data is fetched</span>;
    const item = plan[ritc];
    if (item?.mode === "single") {
      return (
        <span>
          <code>{item.entry.srNo}</code> · {rateText(item.entry)}
          <span className="faint"> · {item.detected ? "already in file" : "only option"}</span>
        </span>
      );
    }
    if (item?.mode === "multi") {
      return (
        <div className="cell-stack">
          {item.groups.map((g) => {
            const idx = g.entry ? item.options.indexOf(g.entry) : -1;
            const id = FIELD.dbk(ritc, g.key);
            return (
              <Combobox
                key={g.key}
                id={id}
                label={`DBK for HSN ${ritc}, ${g.label} (${g.rows.length} row${g.rows.length === 1 ? "" : "s"})`}
                hideLabel
                required
                value={idx < 0 ? "" : String(idx)}
                options={item.options.map(toOption)}
                showDetail
                placeholder={`Choose DBK · ${g.label}`}
                hint={g.ambiguous ? "Several generic entries exist. Confirm the right one." : undefined}
                error={error(id)}
                onChange={(v) => s.setPick(ritc, g.key, v === "" ? null : Number(v))}
              />
            );
          })}
        </div>
      );
    }
    return <span className="faint">No DBK options returned</span>;
  };

  return (
    <Sheet id="hsn" title="HSN codes" status={state}>
      <div className="sheet-tools">
        <p className="muted small">Sends HSN codes only.</p>
        <div className="tools-act">
          {progress && (
            <progress aria-label="Duty lookup progress" value={progress.done} max={progress.total} />
          )}
          <button
            type="button"
            className={`btn${looked || progress ? "" : " primary"}`}
            disabled={codes.length === 0}
            onClick={() => (progress ? s.stopDuty() : void s.fetchAllDuty())}
          >
            {progress ? "Stop after current code" : looked ? "Fetch again" : "Fetch duty data"}
          </button>
        </div>
      </div>
      {codes.length === 0 ? (
        <p className="warn pad">No HSN codes found in column K, so there is nothing to look up.</p>
      ) : (
        <table className="hsn-table">
          <thead>
            <tr>
              <th scope="col">HSN</th>
              <th scope="col" className="num">
                Rows
              </th>
              <th scope="col">Duty data</th>
              <th scope="col">Drawback</th>
              {paid && <th scope="col">IGST rate</th>}
            </tr>
          </thead>
          <tbody>
            {codes.map(([code, rows], i) => {
              const st = status[code];
              const pending = progress !== null && !st && i === progress.done;
              const tone = st ?? (pending ? "pending" : "idle");
              const pct = f.igstPercent[code];
              const igstId = FIELD.igst(code);
              return (
                <tr key={code}>
                  <th scope="row">
                    <code>{code}</code>
                  </th>
                  <td className="num">{rows.length}</td>
                  <td>
                    <span className={`st ${tone}`}>
                      {st ? STATUS_TEXT[st] : pending ? "Looking up…" : "Waiting"}
                    </span>
                  </td>
                  <td className="dbk-cell">{dbkCell(code)}</td>
                  {paid && (
                    <td>
                      <Segmented
                        id={igstId}
                        label={`IGST rate for HSN ${code}`}
                        hideLabel
                        required
                        value={pct === undefined ? "" : String(pct)}
                        options={IGST_OPTIONS}
                        error={error(igstId)}
                        onChange={(v) => s.setIgstPercent(code, v === "" ? undefined : Number(v))}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Sheet>
  );
}
