import countryRows from "./countries.json";
import districtJson from "./state-districts.json";

export interface Option {
  value: string;
  label: string;
  /** Secondary line, shown muted under the label and included in search. */
  detail?: string;
}

const byLabel = (a: Option, b: Option): number => a.label.localeCompare(b.label);

export const COUNTRY_OPTIONS: Option[] = countryRows
  .map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))
  .sort(byLabel);

const districtRows = districtJson as [string, string, string, string][];
const districtsByState: Record<string, Option[]> = {};
const stateList: Option[] = [];
for (const [stateCode, stateName, districtCode, districtName] of districtRows) {
  let list = districtsByState[stateCode];
  if (!list) {
    list = [];
    districtsByState[stateCode] = list;
    stateList.push({ value: stateCode, label: `${stateName} (${stateCode})` });
  }
  list.push({ value: districtCode, label: `${districtName} (${districtCode})` });
}

export const STATE_OPTIONS: Option[] = stateList.sort(byLabel);

for (const list of Object.values(districtsByState)) list.sort(byLabel);

export function districtOptions(stateCode: string): Option[] {
  return districtsByState[stateCode] ?? [];
}
