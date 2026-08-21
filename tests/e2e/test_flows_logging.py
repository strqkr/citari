"""Estandar de logging (docs/api-handover.md seccion 'Estandar de logging',
app/logging_config.py) verificado contra `docker logs api` de operaciones
REALES (no mocks): un mini-flujo de login + reserva publica + cancelacion,
con un marcador temporal `--since` antes de arrancarlo.

Valida:
- Cada linea del rango capturado que es JSON es parseable y trae los
  campos base del formatter (timestamp, level, request_id, message); las
  lineas 'request completed' traen ademas method/path/status/sp/duration_ms
  y las 'sql call' traen sp/duration_ms (app/logging_config.py:
  JsonFormatter, _ACCESS_LOG_FIELDS).
- El mini-flujo (login, POST .../bookings publico, POST .../track/.../cancel)
  esta representado en esas lineas.
- GREP NEGATIVO sobre el log CRUDO completo (JSON + no-JSON): el JWT usado
  en el login, las passwords de seed 'bowner123'/'Admin123' y el prefijo de
  hash bcrypt '$2b$' no deben aparecer en ningun lado.
- Si el stream del contenedor no es JSON puro (uvicorn tiene su propio
  access logger, aparte del logging_config.py de la app, y no respeta
  LOG_FORMAT), se documenta el formato real observado en vez de asumir que
  toda linea es JSON - ver docstring de logging_config.py.

Reusa OWNER_PASSWORD/bearer() de conftest.py y unique_tag() de
test_api_helpers.py."""

from __future__ import annotations

import json
import re
import subprocess
import time
from datetime import UTC, datetime

import httpx
import pytest

from conftest import OWNER_PASSWORD, bearer, sql_scalar
from test_api_helpers import unique_tag

pytestmark = pytest.mark.e2e

# Fecha 2033 exclusiva de este archivo (no choca con test_flows_ciclo_completo.py
# ni con test_flows_carrera.py, ver comentarios en esos archivos).
LOGGING_FLOW_DATE = "2033-09-01"

_UVICORN_ACCESS_LOG_RE = re.compile(r"^(INFO|WARNING|ERROR|DEBUG|CRITICAL):\s")


def _docker_logs_since(marker: str) -> str:
    """docker logs api --since <marca RFC3339>. Se combinan stdout+stderr
    del proceso `docker logs` (el contenedor manda todo su log a stdout via
    logging_config.py/uvicorn, pero se combinan ambos por seguridad, sin
    asumir cual stream usa cada logger)."""
    result = subprocess.run(
        ["docker", "logs", "api", "--since", marker],
        capture_output=True,
        text=True,
        timeout=30,
    )
    return result.stdout + result.stderr


def test_logging_standard_json_fields_and_no_secrets_leak(
    client: httpx.Client,
    seed_identities: dict,
    owner1_token: str,
    cleanup_sql,
) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)
    slug = seed_identities["slug1"]
    customer_email = f"zz.e2e.logging.{tag}@example.com"

    # Marca temporal ANTES de arrancar el mini-flujo (RFC3339 con
    # microsegundos, formato que docker logs --since acepta con precision
    # sub-segundo, confirmado empiricamente contra el contenedor real).
    marker = datetime.now(UTC).isoformat()

    # --- mini-flujo real: login -----------------------------------------
    login_resp = client.post(
        "/auth/login",
        json={
            "email": seed_identities["owner1_email"],
            "password": OWNER_PASSWORD,
            "role": "owner",
        },
    )
    assert login_resp.status_code == 200, login_resp.text
    jwt_token = login_resp.json()["accessToken"]
    assert jwt_token  # se busca literal en el grep negativo mas abajo

    # --- mini-flujo real: reserva publica --------------------------------
    block_resp = client.post(
        "/availability-blocks",
        json={
            "locationId": 1,
            "blockDate": LOGGING_FLOW_DATE,
            "startTime": "09:00:00",
            "endTime": "09:30:00",
        },
        headers=h,
    )
    assert block_resp.status_code == 201, block_resp.text
    block_id = block_resp.json()["availabilityBlockId"]
    cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id = {block_id}")

    booking_resp = client.post(
        f"/public/{slug}/bookings",
        json={
            "serviceId": 1,
            "locationId": 1,
            "availabilityBlockId": block_id,
            "customer": {
                "firstName": "Zz",
                "lastName": "Logging Flow",
                "email": customer_email,
                "phone": "8888-5050",
            },
        },
    )
    assert booking_resp.status_code == 201, booking_resp.text
    booking = booking_resp.json()
    booking_id = booking["bookingId"]
    tracking_code = booking["trackingCode"]
    customer_id = sql_scalar(
        f"SELECT customer_id FROM customer_emails WHERE email = '{customer_email}'"
    )
    cleanup_sql(f"DELETE FROM customers WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_emails WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_phones WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM bookings WHERE booking_id = {booking_id}")
    cleanup_sql(f"DELETE FROM tracking_codes WHERE booking_id = {booking_id}")
    cleanup_sql(
        f"DELETE FROM audit_logs WHERE entity_name = 'bookings' AND entity_id = {booking_id}"
    )

    # --- mini-flujo real: cancelacion ------------------------------------
    cancel_resp = client.post(f"/track/{tracking_code}/cancel")
    assert cancel_resp.status_code == 200, cancel_resp.text
    assert cancel_resp.json()["status"] == "cancelled"

    # Margen para que el driver de logs de docker termine de escribir/leer
    # el buffer antes de capturarlo.
    time.sleep(1.0)
    raw_logs = _docker_logs_since(marker)
    assert raw_logs.strip(), (
        f"docker logs api --since {marker!r} no devolvio ninguna linea "
        "(revisar que el contenedor 'api' siga corriendo y que el reloj "
        "del host este razonablemente sincronizado con el del contenedor)"
    )

    lines = [ln for ln in raw_logs.splitlines() if ln.strip()]

    json_lines: list[dict] = []
    non_json_lines: list[str] = []
    for ln in lines:
        try:
            json_lines.append(json.loads(ln))
        except json.JSONDecodeError:
            non_json_lines.append(ln)

    assert json_lines, "ninguna linea del rango capturado por --since es JSON parseable"

    # Toda linea JSON trae los campos base del formatter (JsonFormatter en
    # app/logging_config.py: timestamp/level/request_id/message siempre).
    for entry in json_lines:
        missing = {"timestamp", "level", "request_id", "message"} - entry.keys()
        assert not missing, f"linea JSON sin campos base {missing}: {entry}"

    request_completed = [e for e in json_lines if e.get("message") == "request completed"]
    sql_calls = [e for e in json_lines if e.get("message") == "sql call"]

    assert request_completed, "no se encontro ninguna linea 'request completed' en el rango capturado"
    for entry in request_completed:
        missing = {"method", "path", "status", "sp", "duration_ms"} - entry.keys()
        assert not missing, f"linea 'request completed' sin campos {missing}: {entry}"

    assert sql_calls, "no se encontro ninguna linea 'sql call' en el rango capturado"
    for entry in sql_calls:
        missing = {"sp", "duration_ms"} - entry.keys()
        assert not missing, f"linea 'sql call' sin campos {missing}: {entry}"

    # El mini-flujo (login, reserva publica, cancelacion) debe estar
    # representado en las lineas 'request completed' capturadas.
    paths_seen = {e["path"] for e in request_completed}
    assert "/api/v1/auth/login" in paths_seen, paths_seen
    assert any(
        p.startswith(f"/api/v1/public/{slug}") and p.endswith("/bookings") for p in paths_seen
    ), paths_seen
    assert any(p.endswith("/cancel") and "/track/" in p for p in paths_seen), paths_seen

    # GREP NEGATIVO sobre el log CRUDO completo (JSON + no-JSON): ni el JWT
    # usado en este mismo flujo, ni las passwords de seed, ni un hash
    # bcrypt deben aparecer en ningun lado (PROHIBITED, ver docstring de
    # app/logging_config.py).
    assert jwt_token not in raw_logs, "el JWT de esta sesion aparece en los logs del contenedor"
    assert "bowner123" not in raw_logs, "la password de seed 'bowner123' aparece en los logs"
    assert "Admin123" not in raw_logs, "la password de seed 'Admin123' aparece en los logs"
    assert "$2b$" not in raw_logs, "un hash bcrypt ('$2b$') aparece en los logs"

    # Documentacion del formato real observado (no es un fallo del
    # estandar de logging de la app en si: JsonFormatter si emite JSON puro
    # linea por linea para cada logger.info() de la app; las lineas
    # no-JSON, si las hay, son el access log por defecto de uvicorn - un
    # logger aparte que la app no controla via LOG_FORMAT).
    uvicorn_like = [ln for ln in non_json_lines if _UVICORN_ACCESS_LOG_RE.match(ln)]
    other_non_json = [ln for ln in non_json_lines if ln not in uvicorn_like]
    print(
        f"\n[logging] lineas JSON de la app: {len(json_lines)} "
        f"(request completed: {len(request_completed)}, sql call: {len(sql_calls)}); "
        f"lineas no-JSON: {len(non_json_lines)} "
        f"(estilo uvicorn access log: {len(uvicorn_like)}, otras: {len(other_non_json)})"
    )
    if non_json_lines:
        print(f"[logging] ejemplo de linea no-JSON: {non_json_lines[0]!r}")
    assert not other_non_json, (
        "hay lineas no-JSON que NO calzan con el patron de access log de uvicorn "
        f"(formato realmente desconocido, documentar en el reporte): {other_non_json[:3]}"
    )
