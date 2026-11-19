"""Aggregation helpers over real MongoDB data — shared by dashboard and analytics."""

from datetime import date, timedelta

from lib.db import db

AGING_BUCKETS = [("0-30", 0, 30), ("31-60", 31, 60), ("61-90", 61, 90), ("90+", 91, None)]

# GL expense accounts that are NOT already counted via AP invoices (avoids double counting)
GL_EXPENSE_PREFIXES = ("5", "6", "7")


def _bucket_of(days: int | None) -> str:
    if days is None:
        return "0-30"
    for name, lo, hi in AGING_BUCKETS:
        if days >= lo and (hi is None or days <= hi):
            return name
    return "90+"


async def source_status_counts() -> dict:
    rows = await db.source_records.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]).to_list(10)
    out = {"total": 0, "pending": 0, "synced": 0, "failed": 0}
    for r in rows:
        key = r["_id"] if r["_id"] in ("pending", "synced", "failed") else "pending"
        out[key] += r["count"]
        out["total"] += r["count"]
    return out


async def financial_summary() -> dict:
    """Consolidated INR financial KPIs computed from FinSight (dest_records)."""
    so = await db.dest_records.aggregate([
        {"$match": {"domain": "so"}},
        {"$group": {"_id": None, "revenue": {"$sum": "$net_amount_inr"}, "tax": {"$sum": "$tax_amount_inr"},
                    "gross": {"$sum": "$gross_amount_inr"}}},
    ]).to_list(1)

    gl_expense = await db.dest_records.aggregate([
        {"$match": {"domain": "gl", "debit_credit": "Debit"}},
        {"$group": {"_id": None, "total": {"$sum": "$gross_amount_inr"}}},
    ]).to_list(1)
    ap_expense = await db.dest_records.aggregate([
        {"$match": {"domain": "ap", "debit_credit": "Credit"}},
        {"$group": {"_id": None, "total": {"$sum": "$gross_amount_inr"}}},
    ]).to_list(1)
    ap_pay = await db.dest_records.aggregate([
        {"$match": {"domain": "ap", "debit_credit": "Debit"}},
        {"$group": {"_id": None, "total": {"$sum": "$gross_amount_inr"}}},
    ]).to_list(1)
    ar_inv = await db.dest_records.aggregate([
        {"$match": {"domain": "ar", "debit_credit": "Debit"}},
        {"$group": {"_id": None, "total": {"$sum": "$gross_amount_inr"}}},
    ]).to_list(1)
    ar_rec = await db.dest_records.aggregate([
        {"$match": {"domain": "ar", "debit_credit": "Credit"}},
        {"$group": {"_id": None, "total": {"$sum": "$gross_amount_inr"}}},
    ]).to_list(1)
    cash = await db.dest_records.aggregate([
        {"$match": {"domain": "bs"}},
        {"$group": {"_id": "$debit_credit", "total": {"$sum": "$gross_amount_inr"}}},
    ]).to_list(5)
    inv = await db.dest_records.aggregate([
        {"$match": {"domain": "inv"}},
        {"$group": {"_id": None, "total": {"$sum": "$gross_amount_inr"}}},
    ]).to_list(1)

    cash_in = next((c["total"] for c in cash if c["_id"] == "Debit"), 0.0)
    cash_out = next((c["total"] for c in cash if c["_id"] == "Credit"), 0.0)
    revenue = round((so[0]["revenue"] if so else 0) or 0, 2)
    # GL debits on non-material expense accounts (5/6/7 prefixes) — material costs arrive via AP invoices
    gl_debits = round((gl_expense[0]["total"] if gl_expense else 0) or 0, 2)
    ap_invoices = round((ap_expense[0]["total"] if ap_expense else 0) or 0, 2)
    expenses = round(ap_invoices + gl_debits, 2)

    return {
        "revenue_inr": revenue,
        "expenses_inr": expenses,
        "ebitda_inr": round(revenue - expenses, 2),
        "cash_inflow_inr": round(cash_in, 2),
        "cash_outflow_inr": round(cash_out, 2),
        "net_cash_flow_inr": round(cash_in - cash_out, 2),
        "ap_outstanding_inr": round(ap_invoices - ((ap_pay[0]["total"] if ap_pay else 0) or 0), 2),
        "ar_outstanding_inr": round(((ar_inv[0]["total"] if ar_inv else 0) or 0) - ((ar_rec[0]["total"] if ar_rec else 0) or 0), 2),
        "inventory_value_inr": round((inv[0]["total"] if inv else 0) or 0, 2),
        "gst_collected_inr": round((so[0]["tax"] if so else 0) or 0, 2),
    }


async def monthly_series(months: int = 12) -> list[dict]:
    """Revenue / expenses / net cash per month (Indian FY buckets) from FinSight data."""
    today = date.today()
    month_starts = []
    y, m = today.year, today.month
    for _ in range(months):
        month_starts.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    month_starts.reverse()

    docs = await db.dest_records.find(
        {"doc_date": {"$ne": None}},
        {"doc_date": 1, "domain": 1, "debit_credit": 1, "net_amount_inr": 1, "gross_amount_inr": 1, "gl_account": 1},
    ).to_list(5000)

    buckets = {ms: {"month": ms, "revenue": 0.0, "expenses": 0.0, "cash_in": 0.0, "cash_out": 0.0} for ms in month_starts}
    for d in docs:
        ms = (d.get("doc_date") or "")[:7]
        if ms not in buckets:
            continue
        b = buckets[ms]
        gross = d.get("gross_amount_inr") or 0
        if d["domain"] == "so":
            b["revenue"] += d.get("net_amount_inr") or 0
        elif d["domain"] == "ap" and d["debit_credit"] == "Credit":
            b["expenses"] += gross
        elif d["domain"] == "gl" and d["debit_credit"] == "Debit" and str(d.get("gl_account") or "").startswith(GL_EXPENSE_PREFIXES):
            b["expenses"] += gross
        elif d["domain"] == "bs":
            if d["debit_credit"] == "Debit":
                b["cash_in"] += gross
            else:
                b["cash_out"] += gross
    out = []
    for ms, b in buckets.items():
        out.append({
            "month": ms,
            "revenue_inr": round(b["revenue"], 2),
            "expenses_inr": round(b["expenses"], 2),
            "net_cash_flow_inr": round(b["cash_in"] - b["cash_out"], 2),
        })
    return out


async def ap_ar_aging() -> dict:
    """Open AP/AR item aging from SOURCE records (SAP open items, INR)."""
    out = {}
    for domain, label in (("ap", "payables"), ("ar", "receivables")):
        docs = await db.source_records.find({"domain": domain}, {"aging_days": 1, "amount_inr": 1}).to_list(3000)
        buckets = [{"bucket": name, "amount_inr": 0.0, "count": 0} for name, _, _ in AGING_BUCKETS]
        for d in docs:
            amount = d.get("amount_inr") or 0
            name = _bucket_of(d.get("aging_days"))
            for b in buckets:
                if b["bucket"] == name:
                    b["amount_inr"] += amount
                    b["count"] += 1
        for b in buckets:
            b["amount_inr"] = round(b["amount_inr"], 2)
        out[label] = buckets
    return out


async def plant_performance() -> list[dict]:
    """Per-plant revenue, expenses, GST paid (FinSight) + sync reliability (SAP source)."""
    dest_rows = await db.dest_records.aggregate([
        {"$group": {
            "_id": {"plant": "$plant_code", "domain": "$domain", "dc": "$debit_credit"},
            "gross": {"$sum": "$gross_amount_inr"}, "net": {"$sum": "$net_amount_inr"},
            "tax": {"$sum": {"$add": [{"$ifNull": ["$cgst_inr", 0]}, {"$ifNull": ["$sgst_inr", 0]}, {"$ifNull": ["$igst_inr", 0]}]}},
        }},
    ]).to_list(500)

    src_rows = await db.source_records.aggregate([
        {"$group": {"_id": {"plant": "$plant_code", "status": "$status"}, "count": {"$sum": 1}}},
    ]).to_list(100)

    plants: dict[str, dict] = {}
    for row in dest_rows:
        plant = row["_id"]["plant"] or "Unknown"
        entry = plants.setdefault(plant, {"plant_code": plant, "revenue_inr": 0.0, "expenses_inr": 0.0,
                                          "gst_paid_inr": 0.0, "records_synced": 0, "reliability_pct": 0.0})
        domain, dc, gross = row["_id"]["domain"], row["_id"]["dc"], row["gross"] or 0
        if domain == "so":
            entry["revenue_inr"] += row["net"] or 0
        if (domain == "ap" and dc == "Credit") or (domain in ("gl", "cc") and dc == "Debit"):
            entry["expenses_inr"] += gross
        entry["gst_paid_inr"] += row["tax"] or 0
        entry["records_synced"] += 1

    for row in src_rows:
        plant = row["_id"]["plant"] or "Unknown"
        entry = plants.setdefault(plant, {"plant_code": plant, "revenue_inr": 0.0, "expenses_inr": 0.0,
                                          "gst_paid_inr": 0.0, "records_synced": 0, "reliability_pct": 0.0})
        if row["_id"]["status"] == "synced":
            entry["_synced"] = row["count"]
        entry.setdefault("_total", {})
        entry["_total"][row["_id"]["status"]] = row["count"]

    out = []
    for entry in plants.values():
        totals = entry.pop("_total", {})
        synced = totals.get("synced", 0) or entry.get("_synced", 0)
        total = sum(totals.values()) or synced
        entry.pop("_synced", None)
        entry["reliability_pct"] = round((synced / total) * 100, 1) if total else 0.0
        entry["revenue_inr"] = round(entry["revenue_inr"], 2)
        entry["expenses_inr"] = round(entry["expenses_inr"], 2)
        entry["gst_paid_inr"] = round(entry["gst_paid_inr"], 2)
        out.append(entry)
    out.sort(key=lambda p: p["plant_code"])
    return out
