import type { Loaded } from "../../io/workbook";
import * as s from "../store";
import { focusField } from "../ui";
import { ActivityLog } from "./ActivityLog";
import { FileSummary } from "./UploadSection";

export function Dock({ wb }: { wb: Loaded }) {
  const blocked = s.blockers.value;
  const notes = s.warnings.value;
  const filled = s.output.value !== null;

  const jump = (id: string) => {
    s.showErrors.value = true;
    focusField(id);
  };
  const apply = () => {
    const first = blocked[0];
    if (first) jump(first.id);
    else void s.applyFill();
  };

  let headline = "Ready to fill";
  if (blocked.length > 0) headline = `${blocked.length} thing${blocked.length === 1 ? "" : "s"} to finish`;
  else if (filled) headline = "Filled. Ready to download";

  return (
    <aside className="dock" aria-label="Fill and download">
      <FileSummary wb={wb} />
      <h2 className={blocked.length > 0 ? "warn" : "ok"}>{headline}</h2>
      {blocked.length > 0 && (
        <ul className="todo">
          {blocked.map((b) => (
            <li key={`${b.id}-${b.message}`}>
              <button type="button" className="link" onClick={() => jump(b.id)}>
                {b.message}
              </button>
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <ul className="notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <div className="dock-actions">
        <button type="button" className={`btn block${filled ? "" : " primary"}`} onClick={apply}>
          Apply and fill
        </button>
        <button
          type="button"
          className={`btn block${filled ? " primary" : ""}`}
          disabled={!filled}
          onClick={() => void s.downloadOutput()}
        >
          Download .xlsx
        </button>
      </div>
      <ActivityLog />
    </aside>
  );
}
