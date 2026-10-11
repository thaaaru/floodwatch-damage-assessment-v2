# SPDX-License-Identifier: Apache-2.0
"""
One-off / resumable backfill of daily ERA5 precipitation (Open-Meteo archive API)
for the 25 district capitals into rain_daily, 1996-01-01 to yesterday.

    docker compose exec floodwatch-backend python scripts/backfill_rain_history.py [--budget 3000]

One district per request, 2-year chunks (~52 Open-Meteo calls each), --sleep
seconds between requests. Stops at --budget calls and resumes where it left off
on the next run; the daily scheduler job also continues it within the same budget.
"""
import argparse
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import Base, engine  # noqa: E402
from app.models import RainDaily  # noqa: E402
from app.services.rain_history import RainHistory  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--budget", type=float, default=3000, help="max Open-Meteo calls this run (default 3000)")
    p.add_argument("--sleep", type=float, default=75, help="seconds between requests (default 75)")
    a = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    Base.metadata.create_all(engine, tables=[RainDaily.__table__])
    used = asyncio.run(RainHistory(sleep_s=a.sleep).backfill(budget_calls=a.budget))
    print(f"Done: ~{used:.0f} Open-Meteo calls used")


if __name__ == "__main__":
    main()
