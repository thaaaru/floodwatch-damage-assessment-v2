# SPDX-License-Identifier: Apache-2.0
"""Hosting guards: DB URL from secret file, alerts off by default."""
from fastapi.testclient import TestClient

from app.config import Settings


def test_database_url_from_secret_file(tmp_path):
    pw = tmp_path / "db_password"
    pw.write_text("p@ss/w:rd\n")
    s = Settings(db_password_file=str(pw), db_host="db")
    assert s.database_url == "postgresql://floodwatch:p%40ss%2Fw%3Ard@db:5432/floodwatch"


def test_database_url_env_fallback():
    s = Settings(database_url="sqlite:///x.db", db_password_file="")
    assert s.database_url == "sqlite:///x.db"


def test_alerts_disabled_routes_absent():
    from app.main import app, settings

    assert settings.alerts_enabled is False
    paths = {r.path for r in app.routes}
    assert "/api/subscribe" not in paths
    assert not any(p.startswith("/api/whatsapp") for p in paths)
    # No lifespan (no scheduler / DB) - routing only.
    assert TestClient(app).post("/api/subscribe", json={}).status_code == 404
