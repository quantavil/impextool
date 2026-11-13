import XLSX from "xlsx-js-style";
import type { DutyRecord } from "../src/core/duty";
import { EXPECTED_HEADERS } from "../src/core/sheet";

export const DUTY: Record<string, DutyRecord> = {
  "9403": {
    hsn: "9403",
    uqc: "NOS",
    dbk: [
      { srNo: "10", desc: "Predominantly of marble", rate: 1.5, unit: "KGS" },
      { srNo: "11", desc: "Of Brass", rate: "2", unit: "NOS" },
      { srNo: "12", desc: "Others", rate: 0.5, unit: "" },
    ],
    rodtepFound: true,
    rodtepUqc: "NOS",
  },
  "7318": { hsn: "7318", uqc: "KGS", dbk: [], rodtepFound: false, rodtepUqc: "" },
};

/** A ProductFormat-style workbook in memory: template headers in row 1, data from row 2. */
export function workbookFile(
  rows: Record<string, string | number>[],
  name = "ProductFormat.xlsx",
  extra: Record<string, string | number> = {},
): File {
  const ws: XLSX.WorkSheet = {};
  const set = (a: string, v: string | number) => {
    ws[a] = { t: typeof v === "number" ? "n" : "s", v };
  };
  for (const [col, header] of Object.entries(EXPECTED_HEADERS)) set(`${col}1`, header);
  rows.forEach((row, i) => {
    for (const [col, v] of Object.entries(row)) set(`${col}${i + 2}`, v);
  });
  for (const [address, v] of Object.entries(extra)) set(address, v);
  ws["!ref"] = `A1:AK${rows.length + 1}`;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return new File([XLSX.write(wb, { bookType: "xlsx", type: "array" })], name);
}
