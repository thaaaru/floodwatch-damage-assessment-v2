# SPDX-License-Identifier: Apache-2.0

from contextlib import asynccontextmanager
from datetime import datetime
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .config import get_settings
from .config.rate_limit import limiter
from .database import engine, Base
from .routers import weather, alerts, subscribers, districts, intel, whatsapp, flood_map, wind, rivers, google_floods, external_flood, map_context, news, rain_history, bulletins
from .jobs.scheduler import start_scheduler, stop_scheduler
from .schemas import HealthResponse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

settings = get_settings()



@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    # Startup
    logger.info("Starting FloodWatch LK Backend...")

    # Create database tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created/verified")

    # Start background scheduler
    start_scheduler()

    yield

    # Shutdown
    logger.info("Shutting down FloodWatch LK Backend...")
    stop_scheduler()

    # Close the shared Google Floods HTTP client (if it was ever initialized).
    try:
        from .services.google_floods import google_floods_service
        if google_floods_service is not None:
            await google_floods_service.aclose()
    except Exception as e:
        logger.warning(f"Error closing Google Floods HTTP client: {e}")

    # Close the shared external flood source client.
    try:
        await external_flood.external_flood_service.aclose()
    except Exception as e:
        logger.warning(f"Error closing external flood HTTP clients: {e}")

    # Close the server-only Maps Platform client if it was initialized.
    try:
        await map_context.google_maps_service.aclose()
    except Exception as e:
        logger.warning(f"Error closing Google Maps HTTP client: {e}")

    try:
        await map_context.nominatim_place_service.aclose()
    except Exception as e:
        logger.warning(f"Error closing Nominatim HTTP client: {e}")

    # Close the shared Open-Meteo Flood HTTP client (if it was ever initialized).
    try:
        from .services.open_meteo_flood import open_meteo_flood_service
        await open_meteo_flood_service.aclose()
    except Exception as e:
        logger.warning(f"Error closing Open-Meteo Flood HTTP client: {e}")

    # Close the shared Met Department HTTP client (if it was ever initialized).
    try:
        from .services.met_department import met_department_service
        await met_department_service.aclose()
    except Exception as e:
        logger.warning(f"Error closing Met Dept HTTP client: {e}")


# Create FastAPI app
app = FastAPI(
    title="FloodWatch LK API",
    description="Flood monitoring for Sri Lanka (unofficial; not a warning service)",
    version="1.0.0",
    lifespan=lifespan
)

# Add rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS
# Production frontend runs on GCP VM behind Caddy at floodwatch.teklab.dev.
# Extra origins can be added via the EXTRA_CORS_ORIGINS env var (comma-separated).
allowed_origins = [
    settings.frontend_url,
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5000",
    "http://localhost:8001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:8001",
    "https://floodwatch.teklab.dev",
]

extra_origins = [
    o.strip()
    for o in (settings.extra_cors_origins or "").split(",")
    if o.strip()
]
allowed_origins.extend(extra_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://[a-zA-Z0-9-]+\.teklab\.dev",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include routers
app.include_router(weather.router)
app.include_router(news.router)
app.include_router(bulletins.router)
app.include_router(rain_history.router)
app.include_router(alerts.router)
app.include_router(districts.router)
app.include_router(intel.router)
app.include_router(flood_map.router)
app.include_router(wind.router)
app.include_router(rivers.router)
app.include_router(google_floods.router)
app.include_router(external_flood.router)
app.include_router(map_context.router)

# Subscription / messaging endpoints exist only when alerts are enabled;
# otherwise they are not registered at all (404).
if settings.alerts_enabled:
    app.include_router(subscribers.router)
    app.include_router(whatsapp.router)

# SOS feed (third-party reports incl. phone numbers): off unless SOS_ENABLED=true.
if settings.sos_enabled:
    app.include_router(intel.sos_router)


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        timestamp=datetime.utcnow()
    )


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "FloodWatch LK API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/health"
    }


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )
