"""Simulated SAP S/4HANA financial-document generator for Meridian Manufacturing Ltd.

Produces realistic multi-currency, multi-plant documents across the 12 monitored
domains with Indian GST splits (CGST/SGST/IGST) and Indian fiscal-year metadata.
This is a simulator — no SAP system is ever contacted.
"""

import hashlib
import random
import uuid
from datetime import date, datetime, timedelta, timezone

from lib.fx import FX_TO_INR

COMPANY = {"code": "1000", "name": "Meridian Manufacturing Ltd", "hq": "Mumbai, Maharashtra"}

PLANTS = [
    {"code": "PL-101", "name": "Chakan Plant", "segment": "Automotive Components", "state": "Maharashtra", "state_code": "27", "gstin": "27AAACM1234F1Z5"},
    {"code": "PL-102", "name": "Sriperumbudur Plant", "segment": "Heavy Machinery", "state": "Tamil Nadu", "state_code": "33", "gstin": "33AAACM1234F1Z8"},
    {"code": "PL-103", "name": "Sanand Plant", "segment": "Precision Engineering", "state": "Gujarat", "state_code": "24", "gstin": "24AAACM1234F1Z2"},
    {"code": "PL-104", "name": "Baddi Plant", "segment": "Industrial Coatings", "state": "Himachal Pradesh", "state_code": "02", "gstin": "02AAACM1234F1Z1"},
    {"code": "PL-105", "name": "Jamshedpur Plant", "segment": "Forging & Foundry", "state": "Jharkhand", "state_code": "20", "gstin": "20AAACM1234F1Z4"},
    {"code": "PL-106", "name": "Hosur Plant", "segment": "Electrical Assemblies", "state": "Tamil Nadu", "state_code": "33", "gstin": "33AAACM1234F1Z9"},
    {"code": "PL-107", "name": "Noida Plant", "segment": "Tooling & R&D", "state": "Uttar Pradesh", "state_code": "09", "gstin": "09AAACM1234F1Z7"},
]

# (name, state) — GSTIN derived from the state code so intra/inter-state splits are realistic.
VENDORS = [
    ("Tata Steel Ltd", "Maharashtra"), ("Bharat Forge Ltd", "Maharashtra"),
    ("Lakshmi Machine Works", "Tamil Nadu"), ("Sundram Fasteners Ltd", "Tamil Nadu"),
    ("Kirloskar Oil Engines", "Gujarat"), ("Nipro Glass India", "Gujarat"),
    ("Jayaswal Neco Industries", "Jharkhand"), ("Sonal Composites Pvt Ltd", "Haryana"),
    ("Amul Polymers Ltd", "Himachal Pradesh"), ("Vardhman Special Steels", "Punjab"),
    ("Skipper Ltd", "Uttar Pradesh"), ("Bosch Ltd", "Karnataka"),
]
CUSTOMERS = [
    ("Ashok Leyland Ltd", "Tamil Nadu"), ("Mahindra & Mahindra Ltd", "Maharashtra"),
    ("Maruti Suzuki India Ltd", "Haryana"), ("Tata Motors Ltd", "Maharashtra"),
    ("Eicher Motors Ltd", "Uttar Pradesh"), ("Hyundai Motor India", "Haryana"),
    ("Suzuki Motor Gujarat", "Gujarat"), ("Royal Enfield Ltd", "Tamil Nadu"),
    ("JCB India Ltd", "Haryana"), ("Escorts Kubota Ltd", "Haryana"),
    ("John Deere India", "Maharashtra"), ("CEAT Ltd", "Maharashtra"),
]
MATERIALS = [
    ("FG-BRK-4210", "Brake Pad Assembly 4210"), ("FG-GEA-1180", "Helical Gear Set 1180"),
    ("FG-SHA-3320", "Forged Crankshaft 3320"), ("FG-AXL-2201", "Rear Axle Beam 2201"),
    ("RM-STL-0010", "HR Steel Coil CRGO"), ("RM-ALU-0020", "Aluminium Ingot A356"),
    ("SF-BRG-5510", "Taper Roller Bearing 5510"), ("SF-HOS-6620", "Hydraulic Hose Assembly"),
    ("CP-PNT-7700", "Epoxy Primer - Industrial"), ("CP-SLV-7710", "Solvent Thinners 7710"),
    ("EL-HAR-8830", "Wiring Harness Assembly"), ("EL-SEN-9940", "ABS Sensor Module"),
]
COST_CENTRES = [
    ("CC-1001", "Press Shop"), ("CC-1002", "Machining Line"), ("CC-1003", "Assembly Line"),
    ("CC-1004", "Paint Shop"), ("CC-1005", "Quality & Tooling"), ("CC-1006", "Utilities & Effluent"),
    ("CC-1007", "Logistics & Warehouse"),
]
PROFIT_CENTRES = [
    ("PC-2101", "Automotive Components"), ("PC-2102", "Heavy Machinery"),
    ("PC-2103", "Precision Engineering"), ("PC-2104", "Industrial Coatings"),
    ("PC-2105", "Forging & Foundry"), ("PC-2106", "Electrical Assemblies"),
]
GL_ACCOUNTS = [
    ("400010", "Revenue - Domestic Sales", "revenue"), ("400020", "Revenue - Export Sales", "revenue"),
    ("410010", "Scrap Sales & Other Income", "revenue"), ("510010", "Raw Material Consumed", "expense"),
    ("510020", "Consumables & Stores", "expense"), ("520010", "Salaries, Wages & Bonus", "expense"),
    ("530010", "Power, Fuel & Water", "expense"), ("540010", "Freight & Logistics", "expense"),
    ("610010", "Repairs & Maintenance", "expense"), ("710010", "Depreciation - Plant & Machinery", "expense"),
]
BANK_ACCOUNTS = [
    ("HDFC Bank - Current A/c 0041", "HDFC0000041"), ("ICICI Bank - Current A/c 7729", "ICIC0007729"),
    ("State Bank of India - Current A/c 1152", "SBIN0011152"), ("Axis Bank - EEFC A/c 4410", "AXIS0004410"),
]
ASSET_CLASSES = [
    ("AS-CL-100", "CNC Machining Centres"), ("AS-CL-200", "Press Machines"),
    ("AS-CL-300", "Paint Plant Equipment"), ("AS-CL-400", "Material Handling"),
    ("AS-CL-500", "Quality Lab Instruments"), ("AS-CL-600", "Effluent Treatment Plant"),
]
UOMS = ["EA", "KG", "MTR", "SET", "BOX"]

DOMAINS: dict[str, dict] = {
    "gl":  {"name": "General Ledger", "sap_table": "BKPF/BSEG", "doc_type": "FI-GL", "prefix": "51", "amt": (40_000, 8_000_000)},
    "ap":  {"name": "Accounts Payable", "sap_table": "BSIK/BSAK", "doc_type": "FI-AP", "prefix": "19", "amt": (25_000, 6_500_000)},
    "ar":  {"name": "Accounts Receivable", "sap_table": "BSID/BSAD", "doc_type": "FI-AR", "prefix": "01", "amt": (30_000, 9_000_000)},
    "cc":  {"name": "Cost Centre Accounting", "sap_table": "COEP/CSKS", "doc_type": "CO-CCA", "prefix": "80", "amt": (15_000, 2_500_000)},
    "pc":  {"name": "Profit Centre Accounting", "sap_table": "GLPCA/CEPC", "doc_type": "CO-PCA", "prefix": "82", "amt": (20_000, 7_000_000)},
    "ml":  {"name": "Material Ledger", "sap_table": "CKMLCR/MLDOC", "doc_type": "CO-PC-ACT", "prefix": "90", "amt": (10_000, 1_800_000)},
    "po":  {"name": "Purchase Orders", "sap_table": "EKKO/EKPO", "doc_type": "MM-PUR", "prefix": "45", "amt": (50_000, 12_000_000)},
    "so":  {"name": "Sales Orders", "sap_table": "VBAK/VBAP", "doc_type": "SD-SLS", "prefix": "62", "amt": (60_000, 14_000_000)},
    "fa":  {"name": "Fixed Assets", "sap_table": "ANEP/ANLA", "doc_type": "FI-AA", "prefix": "70", "amt": (100_000, 25_000_000)},
    "bs":  {"name": "Bank Statements", "sap_table": "FEBEP/FEBKO", "doc_type": "FI-BL", "prefix": "33", "amt": (20_000, 15_000_000)},
    "bg":  {"name": "Budget & Forecasting", "sap_table": "BPJA/BPGE", "doc_type": "CO-OM-CCA", "prefix": "88", "amt": (50_000, 10_000_000)},
    "inv": {"name": "Inventory & Valuation", "sap_table": "MBEW/MARD", "doc_type": "MM-IM", "prefix": "49", "amt": (15_000, 5_000_000)},
}
DOMAIN_ORDER = list(DOMAINS.keys())

# Weighted source-currency mix — INR-heavy with import/export legs in foreign currency.
CURRENCY_MIX = [("INR", 0.60), ("USD", 0.12), ("EUR", 0.10), ("GBP", 0.06), ("JPY", 0.06), ("AED", 0.06)]

GST_RATES = [(18, 70), (12, 20), (5, 10)]


def _party_gstin(state_code: str, idx: int) -> str:
    return f"{state_code}AABCU1234K1Z{idx % 10}"


def fiscal_for(d: date) -> dict:
    """Indian fiscal year (April-March): FY label, posting period 001-012, quarter."""
    if d.month >= 4:
        fy, period = f"{d.year}-{str(d.year + 1)[2:]}", d.month - 3
    else:
        fy, period = f"{d.year - 1}-{str(d.year)[2:]}", d.month + 9
    return {"fiscal_year": fy, "fiscal_period": f"{period:03d}", "fiscal_quarter": f"Q{(period - 1) // 3 + 1}"}


def _pick_currency() -> str:
    r, acc = random.random(), 0.0
    for cur, w in CURRENCY_MIX:
        acc += w
        if r <= acc:
            return cur
    return "INR"


def _gst(plant: dict, party_state: str, currency: str, amount: float, domain_key: str) -> dict:
    gst_domains = {"ap", "ar", "po", "so"}
    if domain_key not in gst_domains:
        return {"gst_treatment": "na", "cgst": 0.0, "sgst": 0.0, "igst": 0.0, "gst_note": "GST not applicable to this document type"}
    if currency != "INR":
        return {"gst_treatment": "zero_rated", "cgst": 0.0, "sgst": 0.0, "igst": 0.0, "gst_note": "Zero-rated supply under LUT (export/in foreign currency)"}
    rate = random.choices([r for r, _ in GST_RATES], weights=[w for _, w in GST_RATES])[0]
    if party_state == plant["state"]:
        half = round(amount * rate / 200, 2)
        return {"gst_treatment": "intra", "cgst": half, "sgst": half, "igst": 0.0, "gst_note": f"GST @ {rate}% — CGST/SGST split (intra-state)"}
    igst = round(amount * rate / 100, 2)
    return {"gst_treatment": "inter", "cgst": 0.0, "sgst": 0.0, "igst": igst, "gst_note": f"GST @ {rate}% — IGST (inter-state)"}


def make_checksum(domain: str, sap_doc_no: str) -> str:
    return hashlib.sha256(f"{domain}|{sap_doc_no}|meridian".encode()).hexdigest()[:32]


def generate_records(domain_key: str, count: int, days_back: int = 365, status: str = "pending") -> list[dict]:
    """Generate `count` realistic source documents for one domain."""
    cfg = DOMAINS[domain_key]
    now = datetime.now(timezone.utc)
    docs: list[dict] = []
    for i in range(count):
        plant = random.choice(PLANTS)
        cur = _pick_currency()
        amount = round(random.uniform(*cfg["amt"]), 2)
        doc_day = date.today() - timedelta(days=random.randint(0, days_back))
        fiscal = fiscal_for(doc_day)
        party_no, party_name, party_state, party_gstin = "", "", "", ""
        vendor = random.choice(VENDORS)
        customer = random.choice(CUSTOMERS)
        material_no, material_desc = random.choice(MATERIALS)
        qty = random.randint(5, 900)
        dc = "D"

        if domain_key == "gl":
            gl_no, gl_name, gl_cat = random.choice(GL_ACCOUNTS)
            party_name = f"{gl_no} - {gl_name}"
            dc = "D" if gl_cat == "expense" else "C"
        elif domain_key == "ap":
            party_no, party_name, party_state = f"V{random.randint(10000, 99999)}", vendor[0], vendor[1]
            party_gstin = _party_gstin(random.choice(PLANTS)["state_code"], VENDORS.index(vendor))
            party_gstin = _gstin_for_state(party_state, VENDORS.index(vendor))
            dc = "C" if random.random() < 0.7 else "D"  # invoice (credit) vs payment (debit)
        elif domain_key == "ar":
            party_no, party_name, party_state = f"C{random.randint(10000, 99999)}", customer[0], customer[1]
            party_gstin = _gstin_for_state(party_state, CUSTOMERS.index(customer))
            dc = "D" if random.random() < 0.7 else "C"  # invoice (debit) vs receipt (credit)
        elif domain_key == "cc":
            cc_no, cc_name = random.choice(COST_CENTRES)
            party_name = f"{cc_no} - {cc_name}"
        elif domain_key == "pc":
            pc_no, pc_name = random.choice(PROFIT_CENTRES)
            party_name = f"{pc_no} - {pc_name}"
            dc = "C" if random.random() < 0.5 else "D"
        elif domain_key == "ml":
            party_name = f"{material_no} - {material_desc}"
            dc = "C" if random.random() < 0.5 else "D"
        elif domain_key == "po":
            party_no, party_name, party_state = f"V{random.randint(10000, 99999)}", vendor[0], vendor[1]
            party_gstin = _gstin_for_state(party_state, VENDORS.index(vendor))
        elif domain_key == "so":
            party_no, party_name, party_state = f"C{random.randint(10000, 99999)}", customer[0], customer[1]
            party_gstin = _gstin_for_state(party_state, CUSTOMERS.index(customer))
        elif domain_key == "fa":
            asset_no, asset_desc = random.choice(ASSET_CLASSES)
            party_name = f"{asset_no} - {asset_desc}"
            party_gstin = _party_gstin(plant["state_code"], 1)
        elif domain_key == "bs":
            bank, _ifsc = random.choice(BANK_ACCOUNTS)
            party_name = bank
            dc = "C" if random.random() < 0.45 else "D"
        elif domain_key == "bg":
            cc_no, cc_name = random.choice(COST_CENTRES)
            party_name = f"{cc_no} - {cc_name} (Budget/Actual)"
        elif domain_key == "inv":
            party_name = f"{material_no} - {material_desc}"

        doc = {
            "id": str(uuid.uuid4()),
            "sap_doc_no": f"{cfg['prefix']}{random.randint(10_000_000, 99_999_999)}",
            "domain": domain_key,
            "domain_name": cfg["name"],
            "sap_table": cfg["sap_table"],
            "record_type": cfg["doc_type"],
            "company_code": COMPANY["code"],
            "plant_code": plant["code"],
            "plant_name": plant["name"],
            "gstin": plant["gstin"],
            "party_no": party_no or None,
            "party_name": party_name,
            "party_gstin": party_gstin or None,
            "material_no": material_no if domain_key in ("ml", "po", "so", "inv") else None,
            "quantity": float(qty) if domain_key in ("ml", "po", "so", "inv", "cc") else None,
            "uom": random.choice(UOMS) if domain_key in ("ml", "po", "so", "inv") else None,
            "cost_centre": next((c[0] for c in COST_CENTRES if party_name.startswith(c[0])), None),
            "profit_centre": random.choice(PROFIT_CENTRES)[0] if domain_key in ("pc", "so", "ar") else None,
            "currency": cur,
            "amount": amount,
            "debit_credit": dc,
            "fx_rate": FX_TO_INR[cur],
            "amount_inr": round(amount * FX_TO_INR[cur], 2),
            "doc_date": doc_day.isoformat(),
            "sap_doc_date": doc_day.strftime("%Y%m%d"),
            "due_date": (doc_day + timedelta(days=random.choice([15, 30, 45, 60]))).isoformat() if domain_key in ("ap", "ar") else None,
            "aging_days": (date.today() - doc_day).days if domain_key in ("ap", "ar") else None,
            "status": status,
            "sync_job_id": None,
            "error_id": None,
            "checksum": make_checksum(domain_key, "pending"),
            "created_at": now,
        }
        doc["checksum"] = make_checksum(domain_key, doc["sap_doc_no"])
        doc.update(_gst(plant, party_state, cur, doc["amount_inr"], domain_key))
        # ~3% deliberately dirty documents so validation/classification has real work to do
        if random.random() < 0.03:
            defect = random.choice(["amount", "gstin", "doc_date"])
            if defect == "amount":
                doc["amount"] = None
                doc["amount_inr"] = None
            elif defect == "gstin" and doc["party_gstin"]:
                doc["party_gstin"] = "INVALID-GSTIN"
            else:
                doc["sap_doc_date"] = "20260230"  # invalid calendar day
        docs.append(doc)
    return docs


def _gstin_for_state(state: str, idx: int) -> str:
    match = next((p for p in PLANTS if p["state"] == state), None)
    code = match["state_code"] if match else "27"
    return _party_gstin(code, idx)


def idoc_payload(doc: dict) -> dict:
    """Raw-looking SAP OData/IDoc envelope for the payload viewer."""
    fy = str(doc.get("fiscal_year") or "")
    gjahr = fy.split("-")[0] if "-" in fy else (fy or "2026")
    doc_date = str(doc.get("doc_date") or "").replace("-", "") if doc.get("doc_date") else None
    return {
        "_simulation": "SAP S/4HANA OData v2 extract (simulated) — no real SAP system is contacted",
        "transaction": "/SAPHT/OData_SRV",
        "IDoc": {
            "EDI_DC40": {
                "IDOCTYP": "FINSTA05" if doc.get("domain") in ("gl", "ar", "ap") else "ACC_DOCUMENT02",
                "SNDPRN": f"S4H_{doc.get('company_code', '1000')}_{doc.get('plant_code', 'PL-101')}",
                "RCVPRN": "FINSIGHT_INGEST",
                "MESTYP": "FINSTA" if doc.get("domain") in ("gl", "ar", "ap") else "ACC_DOCUMENT",
                "CREDAT": doc_date,
            },
            "E1IDBS01": {
                "BELNR": doc.get("sap_doc_no", ""),
                "BUKRS": doc.get("company_code", "1000"),
                "GJAHR": gjahr,
                "POPER": str(doc.get("fiscal_period") or "01"),
                "BUDAT": doc.get("sap_doc_date") or doc.get("doc_date", ""),
                "BLART": doc.get("record_type", ""),
                "WAERS": doc.get("currency", "INR"),
                "WRBTR": doc.get("amount", 0.0),
                "SHKZG": "S" if doc.get("debit_credit") in ("D", "Debit") else "H",
                "WERKS": doc.get("plant_code", ""),
                "LIFNR": doc.get("party_no") if doc.get("domain") in ("ap", "po") else None,
                "KUNNR": doc.get("party_no") if doc.get("domain") in ("ar", "so") else None,
                "MATNR": doc.get("material_no"),
                "MENGE": doc.get("quantity"),
                "MEINS": doc.get("uom"),
                "GST_SEG": {
                    "CGST_AMT": doc.get("cgst", 0.0), "SGST_AMT": doc.get("sgst", 0.0),
                    "IGST_AMT": doc.get("igst", 0.0), "TREATMENT": doc.get("gst_treatment"),
                },
            },
        },
        "checksum": doc.get("checksum", ""),
    }
