"""Pydantic v2 models — integration entities (endpoints, mappings, jobs, errors, monitoring)."""

from datetime import datetime

from pydantic import BaseModel, Field


class ApiEndpoint(BaseModel):
    id: str
    key: str
    side: str  # source | destination
    domain: str
    domain_name: str
    name: str
    method: str
    path: str
    base_url: str
    auth_type: str
    auth_doc: str
    description: str
    status: str  # up | down
    request_sample: dict = Field(default_factory=dict)
    response_sample: dict = Field(default_factory=dict)
    headers: dict = Field(default_factory=dict)
    test_count: int = 0
    test_success_count: int = 0
    avg_latency_ms: float | None = None
    last_test_at: datetime | None = None
    last_test_success: bool | None = None


class EndpointTest(BaseModel):
    id: str
    endpoint_id: str
    endpoint_key: str
    method: str
    path: str
    status_code: int
    success: bool
    latency_ms: int
    request_sample: dict = Field(default_factory=dict)
    response_sample: dict = Field(default_factory=dict)
    tested_by_email: str
    created_at: datetime


class FieldMapping(BaseModel):
    id: str
    domain: str
    domain_name: str
    sap_field: str
    finsight_field: str
    transform: str
    sample: str
    required: bool
    active: bool = True


class SyncJob(BaseModel):
    id: str
    domain: str
    domain_name: str
    batch_size: int
    strategy: str
    reprocess: bool = False
    mode: str = "manual"
    extracted: int
    transformed: int
    loaded: int
    duplicates_skipped: int
    validation_failed: int
    failed: int
    duration_ms: int
    status: str
    triggered_by_email: str | None = None
    message: str
    created_at: datetime
    finished_at: datetime | None = None


class ErrorRecord(BaseModel):
    id: str
    source_id: str | None = None
    source_doc_no: str | None = None
    domain: str | None = None
    domain_name: str | None = None
    classification: str
    message: str
    job_id: str | None = None
    attempts: int = 0
    status: str
    dead_letter: bool = False
    next_retry_at: datetime | None = None
    payload_snapshot: dict = Field(default_factory=dict)
    region: str = "ap-south-1"
    created_at: datetime
    resolved_at: datetime | None = None


class CircuitBreaker(BaseModel):
    key: str
    domain: str
    state: str
    consecutive_failures: int = 0
    total_failures: int = 0
    opened_at: datetime | None = None
    updated_at: datetime | None = None
    endpoint_key: str | None = None
    endpoint_status: str | None = None


class ReconRow(BaseModel):
    source_id: str
    dest_id: str | None = None
    domain: str
    domain_name: str | None = None
    sap_doc_no: str
    finsight_ref: str | None = None
    plant_code: str
    party_name: str | None = None
    source_amount_inr: float | None = None
    dest_amount_inr: float | None = None
    source_debit_credit: str
    dest_debit_credit: str | None = None
    delta_inr: float | None = None
    kind: str


class ReconciliationRun(BaseModel):
    id: str
    scope: str
    domain: str | None = None
    counts: dict
    totals: dict
    status: str
    adjusted: bool = False
    rows: list[ReconRow]
    duration_ms: int
    created_by_email: str | None = None
    created_at: datetime


class MonitoringMetric(BaseModel):
    id: str
    key: str
    name: str
    unit: str
    category: str
    description: str
    direction: str  # above | below — which side of the threshold is bad
    warn_threshold: float
    crit_threshold: float
    value: float | None = None
    state: str = "ok"  # ok | warn | crit
    computed_at: datetime | None = None


class AlertItem(BaseModel):
    metric_key: str
    metric_name: str
    severity: str  # warning | critical
    value: float
    threshold: float
    unit: str
    message: str


class AuditEntry(BaseModel):
    id: str
    action: str
    actor_email: str
    actor_role: str
    detail: dict = Field(default_factory=dict)
    severity: str = "info"
    region: str = "ap-south-1"
    created_at: datetime


class SyncSchedule(BaseModel):
    domain: str
    domain_name: str
    interval: str
    updated_at: datetime | None = None
