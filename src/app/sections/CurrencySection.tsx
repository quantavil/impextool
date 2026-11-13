import { FIELD } from "../../core/fill";
import type { Loaded } from "../../io/workbook";
import * as s from "../store";
import { Combobox, Field, Sheet, type StepStatus } from "../ui";

export function CurrencySection({ wb }: { wb: Loaded }) {
  const f = s.form.value;
  const paid = f.paymentStatus === "P";
  const live = s.rates.value;
  const m = s.manual.value;
  const liveCode = live.some((c) => c.code === f.currency?.code) ? (f.currency?.code ?? "") : "";
  const badRate = m.rate !== "" && !(Number.parseFloat(m.rate) > 0);
  const open = s.pendingIn(FIELD.currency);
  const error = (id: string) => (s.showErrors.value ? s.blockerById.value[id] : undefined);

  if (!paid) return null;
  const status: StepStatus =
    open === 0 ? { tone: "ok", text: "Complete" } : { tone: "warn", text: `${open} open` };

  return (
    <Sheet id="currency" title="Currency and IGST" status={status}>
      <>
        {f.currency && (
          <p className="muted">
            Using <strong>{f.currency.code}</strong> at EXP {f.currency.exp}.
          </p>
        )}
        <div className="rows">
          <div className="field-with-action">
            <Combobox
              id={FIELD.currency}
              label="Live EXP rate"
              required
              value={liveCode}
              options={live.map((c) => ({
                value: c.code,
                label: `${c.name} (${c.code})`,
                detail: `EXP ${c.exp}`,
              }))}
              placeholder={live.length ? "Search currencies" : "No live rates loaded"}
              error={error(FIELD.currency)}
              onChange={s.pickLiveCurrency}
            />
            <button
              type="button"
              className="btn"
              disabled={s.ratesLoading.value}
              onClick={() => void s.loadRates()}
            >
              {s.ratesLoading.value ? "Refreshing…" : "Refresh rates"}
            </button>
          </div>
          <Field id="manual-code" label="Or enter a currency code">
            <input
              id="manual-code"
              value={m.code}
              placeholder="USD"
              spellcheck={false}
              autoComplete="off"
              onInput={(e) => s.setManual(e.currentTarget.value, s.manual.value.rate)}
            />
          </Field>
          <Field id="manual-rate" label="EXP rate" error={badRate ? "Enter a rate above 0." : undefined}>
            <input
              id="manual-rate"
              type="number"
              step="0.01"
              min="0"
              value={m.rate}
              placeholder="95.10"
              aria-invalid={badRate}
              onInput={(e) => s.setManual(s.manual.value.code, e.currentTarget.value)}
            />
          </Field>
        </div>
      </>
    </Sheet>
  );
}
