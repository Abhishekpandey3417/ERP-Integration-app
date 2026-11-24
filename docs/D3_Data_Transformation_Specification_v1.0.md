# D3: Data Transformation Specification (v1.0)

**Project:** Custom API Integration Between Client's ERP (SAP S/4HANA) and Financial Analytics Platform (FinSight)  
**Standard:** 85 Field Mappings across 12 Business Domains  
**Status:** Approved for Production Deployment  

---

## 1. Overview & Transformation Philosophy

Enterprise data transformation bridges structural and semantic discrepancies between SAP S/4HANA internal relational tables (e.g. `ACDOCA`, `BKPF`, `BSEG`) and the Zetheta FinSight dimensional analytics store.

### 1.1 Core Rules
1. **Currency Normalization**: All monetary amounts are normalized to the group currency (INR) using daily reference FX rates published by the Reserve Bank of India (RBI).
2. **Indian Fiscal Year Translation**: SAP fiscal periods (001–012 for Apr–Mar, plus special adjustment periods 013–016) are mapped to standard calendar months while preserving special-period audit flags.
3. **Statutory GST Parsing**: Intra-state supplies are split into CGST (9%) + SGST (9%), while inter-state supplies are assigned to IGST (18%) based on recipient and supplier GSTIN state codes.
4. **Hierarchy Flattening**: Cost and profit centre parent-child hierarchies are flattened to level-1 through level-7 columns for instant multi-dimensional OLAP slicing.

---

## 2. Comprehensive Field Mapping Catalog (Sample across Core Domains)

### 2.1 General Ledger Domain (Mapped from `ACDOCA`, `BKPF`)

| Map ID | Source SAP Field | Target FinSight Field | Transformation Logic | Validation Rule | Business Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `MAP-GL-001` | `ACDOCA.BELNR` | `journalEntry.documentId` | `CONCAT(BUKRS, '-', GJAHR, '-', LTRIM(BELNR, '0'))` | `NOT NULL; regex: ^[A-Z0-9]{2,6}-\d{4}-\d{1,10}$` | Unique natural business key across ERP instances. |
| `MAP-GL-002` | `ACDOCA.BUDAT` | `journalEntry.postingDate` | `FORMAT(BUDAT, 'YYYY-MM-DD')` from SAP `YYYYMMDD` | `NOT NULL; within current fiscal year +/- 30 days` | Accounting recognition date in ledger. |
| `MAP-GL-003` | `ACDOCA.BLDAT` | `journalEntry.documentDate`| `FORMAT(BLDAT, 'YYYY-MM-DD')` | `NOT NULL; must be <= postingDate + 30 days` | Physical invoice or voucher issue date. |
| `MAP-GL-004` | `ACDOCA.RACCT` | `journalEntry.glAccount` | `LTRIM(RACCT, '0')` then lookup FinSight Chart of Accounts | `Must exist in target CoA master table` | Financial statement reporting line item. |
| `MAP-GL-005` | `ACDOCA.HSL` | `journalEntry.amountLC` | `DECIMAL(HSL, 2)` in local company currency (INR) | `NOT NULL; range -999,999,999.99 to +999,999,999.99` | Net financial impact in INR. |
| `MAP-GL-006` | `ACDOCA.WSL` | `journalEntry.amountTC` | `DECIMAL(WSL, 2)` in original transaction currency | `NOT NULL; matches document currency` | Original invoice face value before FX. |
| `MAP-GL-007` | `ACDOCA.RHCUR` | `journalEntry.localCurrency`| Direct map; validate against ISO 4217 standard (`INR`) | `Must equal 'INR'` | Statutory reporting currency. |
| `MAP-GL-008` | `ACDOCA.RWCUR` | `journalEntry.docCurrency` | Direct map; validate against ISO 4217 (`USD`, `EUR`, `INR`) | `Valid 3-letter ISO currency` | Multi-currency transaction code. |
| `MAP-GL-009` | `ACDOCA.KOSTL` | `journalEntry.costCentre` | `LTRIM(KOSTL, '0')` with fallback to `NULL` | `If populated, must exist in Cost Centre master` | Internal departmental cost tracking. |
| `MAP-GL-010` | `ACDOCA.PRCTR` | `journalEntry.profitCentre`| `LTRIM(PRCTR, '0')` with fallback to `NULL` | `If populated, must exist in Profit Centre master`| Business unit segment profitability. |
| `MAP-GL-011` | `ACDOCA.MONAT` | `journalEntry.fiscalPeriod`| Map: 001–012 to Apr–Mar; 013–016 map to 012 with `specialPeriod=true` | `Range 001 to 016` | Indian financial year reporting period. |
| `MAP-GL-012` | `ACDOCA.BLART` | `journalEntry.documentType`| Lookup SAP document type (`SA`=General, `KR`=Vendor, `DR`=Customer) | `Must map to valid enum value` | Audit classification of journal entry. |

---

### 2.2 Accounts Payable Domain (Mapped from `BSIK`, `LFA1`, `LFC1`)

| Map ID | Source SAP Field | Target FinSight Field | Transformation Logic | Validation Rule | Business Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `MAP-AP-001` | `BSIK.LIFNR` | `vendorInvoice.vendorId` | `LTRIM(LIFNR, '0')` | `NOT NULL; exists in vendor master` | Supplier account identification. |
| `MAP-AP-002` | `LFA1.NAME1` | `vendorInvoice.vendorName` | Direct map; sanitize non-printable ASCII characters | `NOT NULL; max length 100` | Legal name of vendor for AP reporting. |
| `MAP-AP-003` | `BSIK.WRBTR` | `vendorInvoice.grossAmount`| `DECIMAL(WRBTR, 2)` | `Positive decimal value` | Total invoice payable obligation. |
| `MAP-AP-004` | `BSIK.ZFBDT` | `vendorInvoice.baselineDate`| `FORMAT(ZFBDT, 'YYYY-MM-DD')` | `NOT NULL; valid calendar date` | Due-date calculation baseline. |
| `MAP-AP-005` | `BSIK.ZBD1T` | `vendorInvoice.cashDiscountDays`| `INTEGER(ZBD1T)` | `Range 0 to 90` | Payment term cash discount window. |
| `MAP-AP-006` | Calculated | `vendorInvoice.agingDays` | `DATEDIFF(day, doc_date, CURRENT_DATE)` | `Non-negative integer` | Informs working capital aging buckets. |
| `MAP-AP-007` | Calculated | `vendorInvoice.agingBucket` | `IF agingDays <= 30 THEN '0-30' ELSE IF agingDays <= 60 THEN '31-60' ELSE IF agingDays <= 90 THEN '61-90' ELSE '90+'` | `Must be one of: 0-30, 31-60, 61-90, 90+` | Liquidity risk classification. |
| `MAP-AP-008` | `LFA1.STCD1` | `vendorInvoice.gstin` | `UPPER(TRIM(STCD1))` | `Regex: ^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$` | 15-character Indian GSTIN for tax audits. |

---

### 2.3 Sales Orders & Revenue Domain (Mapped from `VBAK`, `VBAP`)

| Map ID | Source SAP Field | Target FinSight Field | Transformation Logic | Validation Rule | Business Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `MAP-SO-001` | `VBAK.VBELN` | `salesOrder.orderId` | `CONCAT('SO-', BUKRS, '-', LTRIM(VBELN, '0'))` | `NOT NULL; unique string` | Sales order document reference. |
| `MAP-SO-002` | `VBAP.NETWR` | `salesOrder.netAmountInr` | `ROUND(NETWR * fx_rate, 2)` | `NOT NULL; >= 0` | Net revenue recognized. |
| `MAP-SO-003` | `VBAP.WERKS` | `salesOrder.plantCode` | `TRIM(WERKS)` | `Must match Meridian plant: PL-101 to PL-107` | Manufacturing plant fulfillment source. |
| `MAP-SO-004` | Calculated | `salesOrder.cgstInr` | `IF gst_treatment == 'intra' THEN ROUND(tax_amount / 2, 2) ELSE 0.0` | `Non-negative` | Central GST split. |
| `MAP-SO-005` | Calculated | `salesOrder.sgstInr` | `IF gst_treatment == 'intra' THEN ROUND(tax_amount / 2, 2) ELSE 0.0` | `Non-negative` | State GST split. |
| `MAP-SO-006` | Calculated | `salesOrder.igstInr` | `IF gst_treatment == 'inter' THEN tax_amount ELSE 0.0` | `Non-negative` | Integrated GST for inter-state sales. |

---

## 3. Data Quality & Transformation Rules Engine

The pipeline executes a deterministic 5-stage transformation pipeline:

1. **Schema Sanitization**: Strips leading zeros from numeric identifiers (e.g. `00010042` $\rightarrow$ `10042`), normalizes unicode whitespace, and standardizes date representations to ISO 8601 (`YYYY-MM-DD`).
2. **Foreign Exchange Valuation**: Translates transaction currencies (`USD`, `EUR`, `GBP`, `JPY`) into consolidated `INR` using historical daily fixes published by the RBI.
3. **Statutory Tax Allocation**: Cross-checks Plant State Code vs Party GSTIN State Code. If matching $\rightarrow$ `Intra-state` (CGST 9% + SGST 9%); if differing $\rightarrow$ `Inter-state` (IGST 18%).
4. **Idempotent Hash Generation**: Generates a canonical SHA-256 fingerprint over business fields to detect changes and ignore redundant sync replays.
