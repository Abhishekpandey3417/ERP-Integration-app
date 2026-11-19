import asyncio
import logging
import os
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter
from fastapi.encoders import ENCODERS_BY_TYPE
from bson import ObjectId
from starlette.middleware.cors import CORSMiddleware

ENCODERS_BY_TYPE[ObjectId] = str

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection (self-loads .env; see lib/db.py)
from lib.db import client, db, ensure_indexes


# Startup runs before the yield, shutdown after it.
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    try:
        user_count = await db.users.count_documents({})
        if user_count == 0:
            logging.getLogger(__name__).info("Database is empty, auto-seeding demo data...")
            from seed import main as seed_db
            await seed_db(True)
            logging.getLogger(__name__).info("Auto-seeding complete.")
    except Exception as e:
        logging.getLogger(__name__).error("Auto-seeding error: %s", e)
    yield
    app.state.index_task.cancel()  # stop a build still running before its client closes
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()


app = FastAPI(
    title="Integration Bridge — ERP Analytics Connector",
    description="Simulated SAP S/4HANA → FinSight integration platform for Meridian Manufacturing Ltd. "
                "No real SAP or FinSight system is contacted — all connectivity is simulated in-process.",
    version="1.0.0",
    lifespan=lifespan,
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"app": "Integration Bridge — ERP Analytics Connector", "status": "ok"}


from routers.analytics import router as analytics_router
from routers.apim import router as apim_router
from routers.auth import router as auth_router
from routers.dashboard import router as dashboard_router
from routers.errmgmt import router as errmgmt_router
from routers.mappings import router as mappings_router
from routers.monitoring import router as monitoring_router
from routers.recon import router as recon_router
from routers.simulator import router as simulator_router
from routers.sync import router as sync_router

for _router in (
    auth_router, dashboard_router, simulator_router, apim_router, mappings_router,
    sync_router, recon_router, errmgmt_router, monitoring_router, analytics_router,
):
    api_router.include_router(_router)

# Include the router in the main app — keep this the last route-registration statement
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
