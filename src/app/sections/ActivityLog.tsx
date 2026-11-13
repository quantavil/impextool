import { useEffect, useRef } from "preact/hooks";
import * as s from "../store";

const MARK = { info: "·", ok: "ok", warn: "!", err: "x" } as const;

export function ActivityLog() {
  const lines = s.logLines.value;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);
  if (lines.length === 0) return null;
  return (
    <details className="log-wrap">
      <summary>
        Activity <span className="muted">({lines.length})</span>
      </summary>
      <div ref={box} className="log" role="log" aria-live="polite">
        {lines.map((l) => (
          <p key={l.id} className={l.level}>
            <span className="log-mark" aria-hidden="true">
              {MARK[l.level]}
            </span>
            {l.message}
          </p>
        ))}
      </div>
      <button type="button" className="link small" onClick={s.clearLog}>
        Clear
      </button>
    </details>
  );
}
