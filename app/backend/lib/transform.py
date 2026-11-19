"""Transformation engine — applies the field mappings (lib/sap_sim source docs → FinSight docs).

Handles currency conversion to INR, SAP YYYYMMDD date normalisation, Indian fiscal
period mapping, GST pass-through and validation. The MAPPING_RULES here are also the
single source of truth the seeder uses to populate the `field_mappings` collection.
"""

import re
import uuid
from datetime import date, datetime, timezone

from lib.fx import FX_TO_INR

GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$")

# (domain, sap_field, finsight_field, transform, sample, required)
MAPPING_RULES: list[tuple[str, str, str, str, str, bool]] = [
    ("gl", "BELNR", "document_no", "direct", "51000123", False),
    ("gl", "BUDAT (YYYYMMDD)", "doc_date", "date_normalize", "20260115 → 2026-01-15", True),
    ("gl", "POPER", "posting_period", "fiscal_period_map", "010 → FY2025-26 · Q3", True),
    ("gl", "WAERS", "currency", "constant:INR", "USD → INR (consolidated)", True),
    ("gl", "WRBTR", "gross_amount_inr", "currency_to_inr", "45120.75 USD × 83.45 → ₹37,65,326.59", True),
    ("gl", "SHKZG (S/H)", "debit_credit", "dc_flag_map", "S → Debit", True),
    ("gl", "HKONT", "gl_account", "direct", "510010", False),
    ("ap", "LIFNR", "party_no", "direct", "V20418", True),
    ("ap", "NAME1", "party_name", "direct", "Tata Steel Ltd", True),
    ("ap", "STCEG", "party_gstin", "gst_validate", "27AABCT1234R1Z5", False),
    ("ap", "WRBTR", "gross_amount_inr", "currency_to_inr", "125000 INR → ₹1,25,000.00", True),
    ("ap", "ZFBDT", "due_date", "date_normalize", "20260214 → 2026-02-14", False),
    ("ap", "BUDAT (YYYYMMDD)", "doc_date", "date_normalize", "20260115 → 2026-01-15", True),
    ("ap", "POPER", "posting_period", "fiscal_period_map", "009 → FY2025-26 · Q2", True),
    ("ap", "WAERS", "currency", "constant:INR", "EUR → INR (consolidated)", True),
    ("ap", "SHKZG (S/H)", "debit_credit", "dc_flag_map", "H → Credit", True),
    ("ap", "WMWST1", "tax_amount_inr", "gst_split", "CGST ₹10,125 + SGST ₹10,125", False),
    ("ar", "KUNNR", "party_no", "direct", "C30544", True),
    ("ar", "NAME1", "party_name", "direct", "Ashok Leyland Ltd", True),
    ("ar", "STCEG", "party_gstin", "gst_validate", "33AABCA5678L1Z9", False),
    ("ar", "WRBTR", "gross_amount_inr", "currency_to_inr", "82000 INR → ₹82,000.00", True),
    ("ar", "BUDAT (YYYYMMDD)", "doc_date", "date_normalize", "20260108 → 2026-01-08", True),
    ("ar", "POPER", "posting_period", "fiscal_period_map", "012 → FY2025-26 · Q4", True),
    ("ar", "WAERS", "currency", "constant:INR", "GBP → INR (consolidated)", True),
    ("ar", "SHKZG (S/H)", "debit_credit", "dc_flag_map", "S → Debit", True),
    ("ar", "WMWST1", "tax_amount_inr", "gst_split", "IGST ₹14,760", False),
    ("cc", "KOSTL", "cost_center_code", "direct", "CC-1001", True),
    ("cc", "KSTAR", "gl_account", "direct", "530010", False),
    ("cc", "WKGBTR", "gross_amount_inr", "currency_to_inr", "148000 INR → ₹1,48,000.00", True),
    ("cc", "BUDAT (YYYYMMDD)", "doc_date", "date_normalize", "20260120 → 2026-01-20", True),
    ("cc", "POPER", "posting_period", "fiscal_period_map", "010 → FY2025-26 · Q3", True),
    ("cc", "MEHRH", "quantity", "direct", "620 EA", False),
    ("cc", "WERKS", "plant_code", "plant_map", "PL-101", True),
    ("pc", "PRCTR", "profit_center_code", "direct", "PC-2101", True),
    ("pc", "WTGBTR", "gross_amount_inr", "currency_to_inr", "560000 INR → ₹5,60,000.00", True),
    ("pc", "BUDAT (YYYYMMDD)", "doc_date", "date_normalize", "20260201 → 2026-02-01", True),
    ("pc", "POPER", "posting_period", "fiscal_period_map", "011 → FY2025-26 · Q4", True),
    ("pc", "SHKZG (S/H)", "debit_credit", "dc_flag_map", "S → Debit", True),
    ("pc", "WERKS", "plant_code", "plant_map", "PL-103", True),
    ("ml", "MATNR", "material_no", "direct", "FG-BRK-4210", True),
    ("ml", "VERPR", "gross_amount_inr", "currency_to_inr", "412.50 × 900 EA", False),
    ("ml", "MEINS", "uom", "direct", "EA", False),
    ("ml", "MENGE", "quantity", "direct", "900 EA", False),
    ("ml", "BUDAT (YYYYMMDD)", "doc_date", "date_normalize", "20260125 → 2026-01-25", True),
    ("ml", "POPER", "posting_period", "fiscal_period_map", "009 → FY2025-26 · Q2", True),
    ("ml", "WERKS", "plant_code", "plant_map", "PL-106", True),
    ("po", "EBELN", "document_no", "direct", "45000876", False),
    ("po", "LIFNR", "party_no", "direct", "V30122", True),
    ("po", "MATNR", "material_no", "direct", "RM-STL-0010", True),
    ("po", "NETPR", "gross_amount_inr", "currency_to_inr", "2100.00 USD × 83.45 → ₹1,75,245.00", True),
    ("po", "MENGE", "quantity", "direct", "450 KG", False),
    ("po", "BEDAT (YYYYMMDD)", "doc_date", "date_normalize", "20260118 → 2026-01-18", True),
    ("po", "POPER", "posting_period", "fiscal_period_map", "010 → FY2025-26 · Q3", True),
    ("po", "WERKS", "plant_code", "plant_map", "PL-102", True),
    ("so", "VBELN", "document_no", "direct", "62000455", False),
    ("so", "KUNNR", "party_no", "direct", "C40189", True),
    ("so", "MATNR", "material_no", "direct", "FG-GEA-1180", True),
    ("so", "NETWR", "gross_amount_inr", "currency_to_inr", "6400.00 EUR × 90.10 → ₹5,76,640.00", True),
    ("so", "MENGE", "quantity", "direct", "120 SET", False),
    ("so", "ERDAT (YYYYMMDD)", "doc_date", "date_normalize", "20260105 → 2026-01-05", True),
    ("so", "POPER", "posting_period", "fiscal_period_map", "011 → FY2025-26 · Q4", True),
    ("so", "WMWST1", "tax_amount_inr", "gst_split", "CGST ₹51,897.60 + SGST ₹51,897.60", False),
    ("so", "WERKS", "plant_code", "plant_map", "PL-101", True),
    ("fa", "ANLN1", "document_no", "direct", "70-AS-1001", False),
    ("fa", "TXT50", "party_name", "direct", "AS-CL-100 - CNC Machining Centres", True),
    ("fa", "ANSWL", "gross_amount_inr", "currency_to_inr", "18500000 INR → ₹1,85,00,000.00", True),
    ("fa", "BUDAT (YYYYMMDD)", "doc_date", "date_normalize", "20260110 → 2026-01-10", True),
    ("fa", "POPER", "posting_period", "fiscal_period_map", "009 → FY2025-26 · Q2", True),
    ("fa", "WERKS", "plant_code", "plant_map", "PL-105", True),
    ("bs", "EBANK/HKTID", "party_name", "direct", "HDFC Bank - Current A/c 0041", True),
    ("bs", "ESBTR", "gross_amount_inr", "currency_to_inr", "2400000 INR → ₹24,00,000.00", True),
    ("bs", "BUDAT (YYYYMMDD)", "doc_date", "date_normalize", "20260202 → 2026-02-02", True),
    ("bs", "POPER", "posting_period", "fiscal_period_map", "011 → FY2025-26 · Q4", True),
    ("bs", "SHKZG (S/H)", "debit_credit", "dc_flag_map", "S → Debit (inflow)", True),
    ("bg", "KOSTL", "cost_center_code", "direct", "CC-1004", True),
    ("bg", "WTJHR", "gross_amount_inr", "currency_to_inr", "950000 INR → ₹9,50,000.00", True),
    ("bg", "BUDAT (YYYYMMDD)", "doc_date", "date_normalize", "20260128 → 2026-01-28", True),
    ("bg", "POPER", "posting_period", "fiscal_period_map", "010 → FY2025-26 · Q3", True),
    ("bg", "VERSN", "record_type", "constant:CO-OM-CCA", "Budget vs Actual", False),
    ("inv", "MATNR", "material_no", "direct", "SF-BRG-5510", True),
    ("inv", "MENGE", "quantity", "direct", "310 BOX", False),
    ("inv", "SALK3", "gross_amount_inr", "currency_to_inr", "780000 INR → ₹7,80,000.00", True),
    ("inv", "BUDAT (YYYYMMDD)", "doc_date", "date_normalize", "20260130 → 2026-01-30", True),
    ("inv", "POPER", "posting_period", "fiscal_period_map", "012 → FY2025-26 · Q4", True),
    ("inv", "WERKS", "plant_code", "plant_map", "PL-104", True),
]

TRANSFORM_LABELS = {
    "direct": "Direct map",
    "currency_to_inr": "Currency → INR",
    "date_normalize": "Date normalise",
    "fiscal_period_map": "Fiscal period map",
    "gst_split": "GST split",
    "gst_validate": "GSTIN validate",
    "dc_flag_map": "D/C flag map",
    "plant_map": "Plant map",
    "constant:INR": "Consolidate to INR",
    "constant:CO-OM-CCA": "Constant",
}

FISCAL_MONTHS = {"01": 4, "02": 5, "03": 6, "04": 7, "05": 8, "06": 9, "07": 10, "08": 11, "09": 12, "10": 1, "11": 2, "12": 3}


def _validate(src: dict) -> list[dict]:
    issues: list[dict] = []
    if src.get("amount") in (None, "", 0):
        issues.append({"field": "WRBTR (amount)", "code": "VALIDATION_ERROR", "message": "Gross amount missing or zero — document rejected before FX conversion"})
    gstin = src.get("party_gstin")
    if gstin and not GSTIN_RE.match(str(gstin)):
        issues.append({"field": "STCEG (GSTIN)", "code": "VALIDATION_ERROR", "message": f"GSTIN '{gstin}' fails 15-character format validation"})
    raw_date = str(src.get("sap_doc_date") or "")
    if not re.match(r"^\d{8}$", raw_date):
        issues.append({"field": "BUDAT (SAP date)", "code": "SCHEMA_MISMATCH", "message": f"SAP date '{raw_date}' is not a valid YYYYMMDD value"})
    else:
        try:
            datetime.strptime(raw_date, "%Y%m%d")
        except ValueError:
            issues.append({"field": "BUDAT (SAP date)", "code": "SCHEMA_MISMATCH", "message": f"SAP date '{raw_date}' is not a valid calendar date"})
    if src.get("currency") not in FX_TO_INR:
        issues.append({"field": "WAERS (currency)", "code": "FX_RATE_MISSING", "message": f"No INR conversion rate available for '{src.get('currency')}'"})
    return issues


def fiscal_from_iso(doc_date: str) -> dict:
    d = date.fromisoformat(doc_date)
    if d.month >= 4:
        fy, period = f"{d.year}-{str(d.year + 1)[2:]}", d.month - 3
    else:
        fy, period = f"{d.year - 1}-{str(d.year)[2:]}", d.month + 9
    return {"fiscal_year": fy, "posting_period": f"{period:03d}", "fiscal_quarter": f"Q{(period - 1) // 3 + 1}"}


def transform_record(src: dict, sync_job_id: str | None = None) -> tuple[dict | None, list[dict], list[dict]]:
    """Apply the full mapping pipeline to one source document.

    Returns (dest_doc | None, steps, issues). dest_doc is None when validation fails.
    """
    steps: list[dict] = []
    issues = _validate(src)
    if issues:
        return None, steps, issues

    now = datetime.now(timezone.utc)
    fx_rate = FX_TO_INR[src["currency"]]
    amount = float(src["amount"])
    gross_inr = round(amount * fx_rate, 2)
    tax_total = round((src.get("cgst") or 0) + (src.get("sgst") or 0) + (src.get("igst") or 0), 2)
    fiscal = fiscal_from_iso(src["doc_date"])
    dc = "Debit" if src["debit_credit"] == "D" else "Credit"

    steps.append({"field": "WAERS", "rule": "currency_to_inr", "detail": f"{src['amount']:,.2f} {src['currency']} × {fx_rate} → ₹{gross_inr:,.2f}"})
    steps.append({"field": "BUDAT", "rule": "date_normalize", "detail": f"{src['sap_doc_date']} → {src['doc_date']} (ISO-8601)"})
    steps.append({"field": "POPER", "rule": "fiscal_period_map", "detail": f"{fiscal['posting_period']} → {fiscal['fiscal_year']} · {fiscal['fiscal_quarter']}"})
    steps.append({"field": "WMWST1", "rule": "gst_split", "detail": f"CGST ₹{(src.get('cgst') or 0):,.2f} · SGST ₹{(src.get('sgst') or 0):,.2f} · IGST ₹{(src.get('igst') or 0):,.2f}"})
    steps.append({"field": "SHKZG", "rule": "dc_flag_map", "detail": f"{src['debit_credit']} → {dc}"})

    dest = {
        "id": str(uuid.uuid4()),
        "finsight_ref": f"FS-{src['domain'].upper()}-{src['sap_doc_no'][-8:]}",
        "source_id": src["id"],
        "source_doc_no": src["sap_doc_no"],
        "domain": src["domain"],
        "domain_name": src["domain_name"],
        "checksum": src.get("checksum") or f"chk-{src['sap_doc_no']}",
        "company_code": src["company_code"],
        "plant_code": src["plant_code"],
        "plant_name": src["plant_name"],
        "party_name": src.get("party_name"),
        "material_no": src.get("material_no"),
        "quantity": src.get("quantity"),
        "uom": src.get("uom"),
        "cost_center_code": src.get("cost_centre"),
        "profit_center_code": src.get("profit_centre"),
        "gl_account": src.get("party_name") if src["domain"] == "gl" else None,
        "source_currency": src["currency"],
        "source_amount": amount,
        "fx_rate_used": fx_rate,
        "currency": "INR",
        "gross_amount_inr": gross_inr,
        "net_amount_inr": round(gross_inr - tax_total, 2),
        "tax_amount_inr": tax_total,
        "cgst_inr": src.get("cgst") or 0.0,
        "sgst_inr": src.get("sgst") or 0.0,
        "igst_inr": src.get("igst") or 0.0,
        "gst_treatment": src.get("gst_treatment"),
        "debit_credit": dc,
        "doc_date": src["doc_date"],
        "fiscal_year": fiscal["fiscal_year"],
        "posting_period": fiscal["posting_period"],
        "fiscal_quarter": fiscal["fiscal_quarter"],
        "sync_job_id": sync_job_id,
        "region": "ap-south-1",
        "loaded_at": now,
    }
    return dest, steps, issues


def sandbox_transform(domain: str, payload: dict) -> dict:
    """Run an arbitrary pasted SAP-shaped payload through the transform pipeline (sandbox)."""
    src = {
        "id": "sandbox",
        "sap_doc_no": str(payload.get("BELNR", "SANDBOX001")),
        "checksum": f"chk-{payload.get('BELNR', 'SANDBOX001')}",
        "domain": domain,
        "domain_name": domain.upper(),
        "record_type": "SANDBOX",
        "company_code": str(payload.get("BUKRS", "1000")),
        "plant_code": str(payload.get("WERKS", "PL-101")),
        "plant_name": payload.get("WERKS", "PL-101"),
        "party_name": payload.get("NAME1", "Sandbox Party"),
        "party_gstin": payload.get("STCEG"),
        "material_no": payload.get("MATNR"),
        "quantity": payload.get("MENGE"),
        "uom": payload.get("MEINS"),
        "cost_centre": payload.get("KOSTL"),
        "profit_centre": payload.get("PRCTR"),
        "currency": str(payload.get("WAERS", "INR")),
        "amount": payload.get("WRBTR"),
        "debit_credit": payload.get("SHKZG", "S"),
        "cgst": payload.get("CGST_AMT", 0),
        "sgst": payload.get("SGST_AMT", 0),
        "igst": payload.get("IGST_AMT", 0),
        "doc_date": None,
        "sap_doc_date": str(payload.get("BUDAT", "")),
    }
    raw = str(payload.get("BUDAT", ""))
    if re.match(r"^\d{8}$", raw):
        try:
            src["doc_date"] = datetime.strptime(raw, "%Y%m%d").date().isoformat()
        except ValueError:
            pass
    dest, steps, issues = transform_record(src, sync_job_id="sandbox")
    return {"dest": dest, "steps": steps, "issues": issues}
