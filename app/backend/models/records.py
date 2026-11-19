"""Pydantic v2 models — source (SAP) and destination (FinSight) records."""

from datetime import datetime

from pydantic import BaseModel, Field


class SourceRecord(BaseModel):
    id: str
    sap_doc_no: str
    domain: str
    domain_name: str
    sap_table: str
    record_type: str
    company_code: str
    plant_code: str
    plant_name: str
    gstin: str | None = None
    party_no: str | None = None
    party_name: str | None = None
    party_gstin: str | None = None
    material_no: str | None = None
    quantity: float | None = None
    uom: str | None = None
    cost_centre: str | None = None
    profit_centre: str | None = None
    currency: str
    amount: float | None = None
    debit_credit: str
    fx_rate: float
    amount_inr: float | None = None
    doc_date: str | None = None
    sap_doc_date: str
    due_date: str | None = None
    aging_days: int | None = None
    fiscal_year: str | None = None
    fiscal_period: str | None = None
    fiscal_quarter: str | None = None
    gst_treatment: str | None = None
    cgst: float = 0.0
    sgst: float = 0.0
    igst: float = 0.0
    gst_note: str | None = None
    status: str
    sync_job_id: str | None = None
    error_id: str | None = None
    checksum: str
    created_at: datetime | None = None


class DestRecord(BaseModel):
    id: str
    finsight_ref: str
    source_id: str
    source_doc_no: str | None = None
    domain: str
    domain_name: str | None = None
    checksum: str
    company_code: str | None = None
    plant_code: str | None = None
    plant_name: str | None = None
    party_name: str | None = None
    material_no: str | None = None
    quantity: float | None = None
    uom: str | None = None
    cost_center_code: str | None = None
    profit_center_code: str | None = None
    gl_account: str | None = None
    source_currency: str
    source_amount: float | None = None
    fx_rate_used: float
    currency: str
    gross_amount_inr: float
    net_amount_inr: float | None = None
    tax_amount_inr: float | None = None
    cgst_inr: float = 0.0
    sgst_inr: float = 0.0
    igst_inr: float = 0.0
    gst_treatment: str | None = None
    debit_credit: str
    doc_date: str | None = None
    fiscal_year: str | None = None
    posting_period: str | None = None
    fiscal_quarter: str | None = None
    sync_job_id: str | None = None
    region: str = "ap-south-1"
    loaded_at: datetime | None = None


class RecordPage(BaseModel):
    items: list[SourceRecord]
    total: int
    page: int
    page_size: int


class DomainStat(BaseModel):
    key: str
    name: str
    sap_table: str
    doc_type: str
    total: int = 0
    pending: int = 0
    synced: int = 0
    failed: int = 0
    dest_count: int = 0
    last_sync_at: datetime | None = None
