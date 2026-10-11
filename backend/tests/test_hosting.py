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


def test_sos_disabled_routes_absent():
    from app.main import app, settings

    assert settings.sos_enabled is False
    client = TestClient(app)
    for path in ["/api/intel/priorities", "/api/intel/clusters", "/api/intel/summary",
                 "/api/intel/actions", "/api/intel/raw-sos", "/api/intel/district/Colombo"]:
        assert client.get(path).status_code == 404, path
    assert client.post("/api/intel/refresh").status_code == 404


def test_owm_key_from_secret_file(tmp_path):
    key = tmp_path / "owm_api_key"
    key.write_text("abc123\n")
    assert Settings(openweathermap_api_key_file=str(key), openweathermap_api_key="").openweathermap_api_key == "abc123"


def test_owm_key_missing_or_empty_file_means_off(tmp_path):
    missing = Settings(openweathermap_api_key_file=str(tmp_path / "nope"), openweathermap_api_key="")
    assert missing.openweathermap_api_key == ""
    empty = tmp_path / "owm_api_key"
    empty.write_text("")
    assert Settings(openweathermap_api_key_file=str(empty), openweathermap_api_key="").openweathermap_api_key == ""


def test_owm_key_env_fallback():
    assert Settings(openweathermap_api_key_file="", openweathermap_api_key="envkey").openweathermap_api_key == "envkey"
