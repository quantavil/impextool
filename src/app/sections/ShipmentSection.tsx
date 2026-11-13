import { FIELD } from "../../core/fill";
import { FTA_CODES } from "../../data/codes";
import { COUNTRY_OPTIONS, districtOptions, type Option, STATE_OPTIONS } from "../../data/geo";
import type { Loaded } from "../../io/workbook";
import * as s from "../store";
import { Combobox, Segmented, Sheet } from "../ui";

const toOption = (code: string): Option => ({ value: code, label: code });
const FTA_OPTIONS: Option[] = FTA_CODES.map(([value, name]) => ({ value, label: `${value} - ${name}` }));
const RODTEP_OPTIONS = s.RODTEP_CHOICES.map(toOption);
const YES_NO_OPTIONS = s.YES_NO.map(toOption);

export function ShipmentSection({ wb }: { wb: Loaded }) {
  const f = s.form.value;
  const g = wb.guidelines;
  const open = s.pendingIn(FIELD.scheme, FIELD.endUse, FIELD.reward, FIELD.payment);
  const error = (id: string) => (s.showErrors.value ? s.blockerById.value[id] : undefined);
  const paymentOptions = g.paymentStatusCodes.map(toOption);

  return (
    <Sheet
      id="shipment"
      title="Shipment"
      status={open === 0 ? { tone: "ok", text: "Complete" } : { tone: "warn", text: `${open} open` }}
    >
      <div className="rows lead-rows">
        <Combobox
          id={FIELD.scheme}
          label="Scheme code"
          lead
          required
          freeText
          value={f.scheme}
          options={g.schemeCodes.map(toOption)}
          placeholder="e.g. 19-Drawback (DBK)"
          error={error(FIELD.scheme)}
          onChange={(v) => s.setField("scheme", v)}
        />
        <Combobox
          id={FIELD.endUse}
          label="End use"
          lead
          required
          freeText
          value={f.endUse}
          options={g.endUseCodes.map(toOption)}
          error={error(FIELD.endUse)}
          onChange={(v) => s.setField("endUse", v)}
        />
      </div>
      <div className="rows seg-rows">
        <Segmented
          id={FIELD.payment}
          label="IGST payment status"
          lead
          required
          value={f.paymentStatus}
          options={paymentOptions}
          error={error(FIELD.payment)}
          onChange={s.choosePayment}
        />
        <Segmented
          id="rodtep"
          label="RoDTEP"
          lead
          value={f.rodtep}
          options={RODTEP_OPTIONS}
          onChange={(v) => s.setField("rodtep", v)}
        />
        <Segmented
          id={FIELD.reward}
          label="Reward item"
          lead
          required
          value={f.reward}
          options={YES_NO_OPTIONS}
          error={error(FIELD.reward)}
          onChange={(v) => s.setField("reward", v)}
        />
      </div>
      <div className="rows opt-rows">
        <Combobox
          id="fta"
          label="FTA code"
          freeText
          value={f.fta ?? ""}
          options={FTA_OPTIONS}
          placeholder="Optional"
          onChange={(v) => s.setField("fta", v)}
        />
        <Combobox
          id="state"
          label="State of origin"
          value={f.state}
          options={STATE_OPTIONS}
          placeholder="Keep file value"
          onChange={s.setState}
        />
        <Combobox
          id="district"
          label="District of origin"
          value={f.district}
          options={districtOptions(f.state)}
          placeholder={f.state ? "Keep file value" : "Choose a state first"}
          disabled={!f.state}
          onChange={(v) => s.setField("district", v)}
        />
        <Combobox
          id="country"
          label="Destination country"
          value={f.country}
          options={COUNTRY_OPTIONS}
          placeholder="Keep file value"
          onChange={(v) => s.setField("country", v)}
        />
      </div>
    </Sheet>
  );
}
