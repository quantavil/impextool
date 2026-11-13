/** Built-in picklists from the ICEGATE directories. They are merged with whatever the workbook's Guidelines sheet lists. */

export const SCHEME_CODES: readonly string[] = `00-Free Shipping bill
01-Advance Licence with actual user condition
02-Advance licence for intermediate supplies
03-Advance licence
04-Advance Release order
05-Advance Licence for deemed exports
06-DEPB-post exports
07-DEPB-pre exports
08-Replenishment licence
09-Diamond imprest licence
10-Bulk licence
11-Concessional duty EPCG scheme
12-Zero duty EPCG scheme
13-CCP
14-Import License For Restricted Items Of Imports
15-Special Import licence
16-Export licence
17-Advance Licence for annual requirement
18-Duty Free Replenishment Certificate
19-Drawback (DBK)
20-Jobbing (JBG)
21-EOU/EPZ/SEZ/EHTP/STP
22-SERVED FROM INDIA SCHEME
23-Target Plus Scheme
24-Vishesh Krishi Upaj Yojana
25-DFCE for Status Holder
26-Duty Free Import Authorisation
27-Focus Market Scheme
28-Focus Product Scheme
29-High-Tech Products Export Promotion Scheme
30-EPCG Duty Based
31-Status Holder Incentive Scheme
35-Incremental Incentivisation Scheme
36-MEIS
36-Merchandise Export Incentive Scheme
37-Service Export Incentive Scheme
40-DBK and Advance Licence for annual requirement
41-Drawback and Advance Licence
42-Drawback and DFRC
43-Drawback and zero duty EPCG
44-Drawback and concessional duty EPCG
45-Drawback and Pre export DEPB
46-Drawback and post export DEPB
47-Drawback and JBG
48-Drawback and Diamond Imprest licence
49-Drawback and EOU/EPZ/SEZ
50-EPCG and Advance licence
51-EPCG and DFRC
52-EPCG and JBG
53-EPCG and Diamond imprest Licence
54-EPCG and Replenishment Licences
55-EPCG and DEPB (Post exports)
56-EPCG and Advance Licence for annual requirement
56-EPCG and DEPB (Pre-exports)
59-EPCG AND DFIA
60-Drawback and Rebate of State Levies
61-EPCG,Drawback and Rebate of State Levies
62-Drawback and special DEEC(4.04A)
63-EPCG,Drawback and special DEEC(4.04A)
64-Drawback,special DEEC(4.04A) and Rebate of State Levis
65-EPCG,Drawback "&" special DEEC(4.04A) and Rebate of State Levis
71-EPCG, DRAWBACK AND DEEC
72-EPCG, DRAWBACK AND DFRC
73-EPCG, DRAWBACK AND JOBBING
74-EPCG, DRAWBACK AND DIAMOND IMPREST LICENCE
75-EPCG, DRAWBACK AND DEPB POST EXPORT
79-EPCG, DRAWBACK AND DFIA
98-Free Shipping Bill involving Indian Currency
99-NFEI`.split("\n");

export const END_USE_CODES: readonly string[] = `DCA100 DCH100 DCH300 DCH400 DCH800 DCX200 DCX900
FSA100 FSA200 FSA800 FSA900 FSH100 FSH200 FSH700 FSH750 FSH800 FSH900 FSH910 FSH920 FSH930
GNX100 GNX200 GNX300 GNX600 GNX650 GNX680 GNX700 GNX810 GNX815 GNX915
LVA100 LVA200 LVA300 LVA400 LVA500 LVA710 LVA760 LVA800 LVA900 LVA950
LVP100 LVP400 LVP500 LVP730`.split(/\s+/);

/** [code, name] from the CBIC Free Trade Agreements directory. */
export const FTA_CODES: readonly (readonly [string, string])[] = [
  ["FTA0SL", "India - Sri Lanka FTA"],
  ["FTA0SA", "Agreement on SAFTA"],
  ["FTA0NL", "India Nepal Treaty of Trade"],
  ["FTA0BT", "India - Bhutan Agreement on Trade Commerce and Transit"],
  ["FTA0TH", "India - Thailand FTA - Early Harvest Scheme (EHS)"],
  ["CEPASG", "India - Singapore CECA"],
  ["CEPASEA", "India - ASEAN - CECA - Trade in Goods, Services and Investment Agreement"],
  ["CEPAKR", "India - South Korea CEPA"],
  ["CEPAJP", "India - Japan CEPA"],
  ["CECAMY", "India - Malaysia CECA"],
  ["PTAAPTA", "Asia Pacific Trade Agreement (APTA)"],
  ["GSTP", "Global System of Trade Preferences (GSTP)"],
  ["PTA0SA", "SAARC Preferential Trading Agreement (SAPTA)"],
  ["PTA0AF", "India - Afghanistan"],
  ["PTA0MER", "India - MERCOSUR"],
  ["PTA0CL", "India - Chile"],
  ["NCPTI", "Preferential Trade Benefit not claimed at Importing Country"],
  ["ECTAAU", "India-AUS ECTA"],
  ["CEPAOM", "India-OMAN CEPA"],
  ["CEPAAE", "India-UAE CEPA"],
  ["CETAUK", "India-UK CETA"],
  ["FTANZD", "India-New Zealand Free Trade Agreement"],
];

/** Sheet values first, then built-in codes the sheet lacks. */
export const mergeCodes = (fromSheet: readonly string[], builtIn: readonly string[]): string[] => [
  ...new Set([...fromSheet, ...builtIn]),
];
