# SPDX-License-Identifier: Apache-2.0

import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..services.alert_engine import AlertEngine
from ..services.weather_cache import weather_cache
from ..services.intel_engine import intel_engine
from ..services.osm_facilities import fetch_all_facilities
from ..services.flood_threat_cache import flood_threat_cache
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

scheduler = AsyncIOScheduler()

WEATHER_CACHE_INTERVAL_MINUTES = 30  # Refresh every 30 minutes for more timely data
INTEL_ANALYSIS_INTERVAL_MINUTES = 30  # Reduced to minimize API load
FACILITIES_REFRESH_INTERVAL_HOURS = 24  # Daily refresh for OSM facilities
FLOOD_THREAT_INTERVAL_MINUTES = 15  # Refresh every 15 minutes for real-time threat assessment
GAUGE_SYNC_INTERVAL_MINUTES = 15  # Irrigation Dept river gauges -> gauge_readings
# Open-Meteo archive calls per day for the ERA5 backfill (~4 districts/day); the weather
# cache already uses ~5k of the 10k free daily calls.
RAIN_HISTORY_DAILY_BUDGET = 3000


async def refresh_weather_cache():
    """Background job to refresh weather data cache."""
    logger.info("Starting weather cache refresh...")
    try:
        success = await weather_cache.refresh_cache(force=True)
        if success:
            logger.info("Weather cache refreshed successfully")
        else:
            logger.warning("Weather cache refresh failed")
    except Exception as e:
        logger.error(f"Error refreshing weather cache: {e}")


async def check_weather_and_alerts():
    """Background job to check weather conditions and trigger alerts."""
    logger.info("Starting weather and alerts check...")

    db: Session = SessionLocal()
    try:
        engine = AlertEngine(db)

        # Check weather for all districts
        weather_alerts = await engine.check_all_districts()
        logger.info(f"Weather check complete. {len(weather_alerts)} alerts triggered.")

        # Check GDACS for flood alerts
        gdacs_alerts = await engine.check_gdacs_alerts()
        logger.info(f"GDACS check complete. {len(gdacs_alerts)} alerts triggered.")

    except Exception as e:
        logger.error(f"Error in weather/alert check: {e}")
    finally:
        db.close()


async def refresh_intel_analysis():
    """Background job to refresh SOS intelligence analysis."""
    logger.info("Starting intelligence analysis refresh...")
    try:
        result = await intel_engine.run_analysis()
        summary = result.get("summary", {})
        logger.info(
            f"Intel analysis complete: {summary.get('total_reports', 0)} reports, "
            f"{summary.get('urgency_breakdown', {}).get('critical', 0)} critical"
        )
    except Exception as e:
        logger.error(f"Error in intel analysis: {e}")


async def refresh_osm_facilities():
    """Background job to refresh OpenStreetMap facilities cache."""
    logger.info("Starting OSM facilities refresh...")
    try:
        facilities = await fetch_all_facilities()
        total = sum(
            len(facilities.get(k, []))
            for k in ["hospitals", "police", "fire_stations", "shelters"]
        )
        logger.info(f"OSM facilities refreshed: {total} facilities cached")
    except Exception as e:
        logger.error(f"Error refreshing OSM facilities: {e}")


async def refresh_flood_threat():
    """Background job to refresh flood threat assessment cache."""
    logger.info("Starting flood threat assessment refresh...")
    try:
        success = await flood_threat_cache.refresh_cache(force=True)
        if success:
            cache_info = flood_threat_cache.get_cache_info()
            cached_data = flood_threat_cache.get_cached_data()
            if cached_data:
                logger.info(
                    f"Flood threat cache refreshed: {cached_data.get('national_threat_level')} "
                    f"(score: {cached_data.get('national_threat_score')})"
                )
            else:
                logger.info("Flood threat cache refreshed successfully")
        else:
            logger.warning("Flood threat cache refresh failed")
    except Exception as e:
        logger.error(f"Error refreshing flood threat cache: {e}")


async def refresh_news():
    """Background job: the only caller of the /news sources."""
    from ..services.news_feed import news_feed
    try:
        await news_feed.refresh()
    except Exception as e:
        logger.error(f"News refresh failed: {e}")


async def update_rain_history():
    """Daily job: the only runtime caller of the Open-Meteo archive API (ERA5).
    Re-fetches the last 14 days (ERA5 lags ~5 days), then continues any unfinished
    1996+ backfill within a daily call budget (see scripts/backfill_rain_history.py)."""
    from ..services.rain_history import rain_history
    try:
        await rain_history.update_recent()
        await rain_history.backfill(budget_calls=RAIN_HISTORY_DAILY_BUDGET)
    except Exception as e:
        logger.error(f"Rain history update failed: {e}")


async def sync_river_gauges():
    """Background job: the only caller of the Irrigation Dept gauge layers."""
    from ..services.irrigation_fetcher import irrigation_fetcher
    try:
        await irrigation_fetcher.sync_gauges()
    except Exception as e:
        logger.error(f"River gauge sync failed (serving stored data): {e}")


def start_scheduler():
    """Initialize and start the background scheduler."""
    interval_minutes = settings.alert_check_interval_minutes

    # Weather cache refresh job - every 30 minutes for more timely data updates
    scheduler.add_job(
        refresh_weather_cache,
        trigger=IntervalTrigger(minutes=WEATHER_CACHE_INTERVAL_MINUTES),
        id="weather_cache_refresh",
        name="Refresh weather data cache",
        replace_existing=True
    )

    # Alert check job
    scheduler.add_job(
        check_weather_and_alerts,
        trigger=IntervalTrigger(minutes=interval_minutes),
        id="weather_alerts_check",
        name="Check weather and alerts",
        replace_existing=True
    )

    # Intel analysis job (SOS feed) - only when SOS_ENABLED=true
    if settings.sos_enabled:
        scheduler.add_job(
            refresh_intel_analysis,
            trigger=IntervalTrigger(minutes=INTEL_ANALYSIS_INTERVAL_MINUTES),
            id="intel_analysis_refresh",
            name="Refresh SOS intelligence analysis",
            replace_existing=True
        )

    # OSM facilities refresh - every 24 hours
    scheduler.add_job(
        refresh_osm_facilities,
        trigger=IntervalTrigger(hours=FACILITIES_REFRESH_INTERVAL_HOURS),
        id="osm_facilities_refresh",
        name="Refresh OpenStreetMap facilities cache",
        replace_existing=True
    )

    # Flood threat assessment - every 15 minutes
    scheduler.add_job(
        refresh_flood_threat,
        trigger=IntervalTrigger(minutes=FLOOD_THREAT_INTERVAL_MINUTES),
        id="flood_threat_refresh",
        name="Refresh flood threat assessment cache",
        replace_existing=True
    )

    # News & updates - every 15 minutes
    scheduler.add_job(
        refresh_news,
        trigger=IntervalTrigger(minutes=15),
        id="news_refresh",
        name="Refresh news sources",
        replace_existing=True
    )

    # River gauges - every 15 minutes (backfills ~7 days on first run)
    scheduler.add_job(
        sync_river_gauges,
        trigger=IntervalTrigger(minutes=GAUGE_SYNC_INTERVAL_MINUTES),
        id="river_gauge_sync",
        name="Sync Irrigation Dept river gauges",
        replace_existing=True
    )

    # 30-year rainfall context (ERA5) - daily, early morning Colombo time
    scheduler.add_job(
        update_rain_history,
        trigger=CronTrigger(hour=3, minute=15, timezone="Asia/Colombo"),
        id="rain_history_update",
        name="Update ERA5 rainfall history",
        replace_existing=True
    )

    scheduler.start()
    logger.info(
        f"Scheduler started. Cache: {WEATHER_CACHE_INTERVAL_MINUTES}min, "
        f"Alerts: {interval_minutes}min, Intel: {INTEL_ANALYSIS_INTERVAL_MINUTES}min, "
        f"Facilities: {FACILITIES_REFRESH_INTERVAL_HOURS}h, "
        f"Flood Threat: {FLOOD_THREAT_INTERVAL_MINUTES}min"
    )

    # Initial tasks on startup
    asyncio.get_event_loop().create_task(refresh_weather_cache())
    if settings.sos_enabled:
        asyncio.get_event_loop().create_task(refresh_intel_analysis())
    asyncio.get_event_loop().create_task(refresh_osm_facilities())
    asyncio.get_event_loop().create_task(sync_river_gauges())
    asyncio.get_event_loop().create_task(refresh_news())
    asyncio.get_event_loop().create_task(refresh_flood_threat())


def stop_scheduler():
    """Stop the background scheduler."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped.")
