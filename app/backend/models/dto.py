"""Pydantic v2 models — request bodies and list/aggregation envelopes."""

from pydantic import BaseModel, Field

from models.integration import ErrorRecord


class GenerateRequest(BaseModel):
    domain: str
    count: int = Field(ge=10, le=500)


class SyncRunRequest(BaseModel):
    domain: str
    batch_size: int = Field(default=100, ge=1, le=500)
    strategy: str = "checksum"  # checksum | doc_id
    reprocess: bool = False


class ReconRunRequest(BaseModel):
    domain: str | None = None  # None → reconcile all domains


class HealthToggleRequest(BaseModel):
    status: str  # up | down


class ThresholdUpdate(BaseModel):
    warn_threshold: float
    crit_threshold: float


class RequeueRequest(BaseModel):
    patched_payload: dict | None = None


class SandboxRequest(BaseModel):
    domain: str
    payload: dict


class ScheduleUpdate(BaseModel):
    interval: str


class ErrorPage(BaseModel):
    items: list[ErrorRecord]
    counts: dict[str, int]
