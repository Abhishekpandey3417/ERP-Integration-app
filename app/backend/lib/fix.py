"""FX rates — simulated RBI reference feed used to consolidate to INR.

Single source of truth for currency conversion across the transform engine,
the sandbox tester and the monitoring "currency freshness" metric.
"""

from datetime import datetime, timezone

FX_TO_INR: dict[str, float] = {
    "INR": 1.0,
    "USD": 83.45,
    "EUR": 90.10,
    "GBP": 105.80,
    "JPY": 0.54,
    "AED": 22.72,
}

FX_SOURCE = "RBI reference rates (simulated feed, ap-south-1)"
FX_SYNCED_AT: datetime = datetime(2026, 1, 1, 4, 0, tzinfo=timezone.utc)


def to_inr(amount: float, currency: str) -> tuple[float, float]:
    """Return (amount_inr, fx_rate). Raises KeyError for an unknown currency."""
    rate = FX_TO_INR[currency]
    return round(amount * rate, 2), rate


def rates_payload() -> dict:
    return {
        "source": FX_SOURCE,
        "synced_at": FX_SYNCED_AT,
        "rates": [{"currency": cur, "rate_to_inr": rate} for cur, rate in FX_TO_INR.items()],
    }
