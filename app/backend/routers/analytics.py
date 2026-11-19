"""Financial Analytics — consolidated INR KPIs, monthly flows, AP/AR aging, plant performance."""

from fastapi import APIRouter, Depends

from lib.aggregations import ap_ar_aging, financial_summary, monthly_series, plant_performance
from lib.auth import get_current_user
from lib.pipeline import utcnow

router = APIRouter(prefix="/analytics", tags=["financial-analytics"])


@router.get("/financial")
async def financial(user: dict = Depends(get_current_user)):
    return {
        "kpis": await financial_summary(),
        "monthly": await monthly_series(),
        "aging": await ap_ar_aging(),
        "generated_at": utcnow(),
    }


@router.get("/plants")
async def plants(user: dict = Depends(get_current_user)):
    return {"plants": await plant_performance()}
