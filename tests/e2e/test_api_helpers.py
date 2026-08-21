"""Helpers compartidos por los tests test_api_*.py. No define ningun test:
pytest lo importa como cualquier otro modulo del directorio (import-mode
prepend, sin __init__.py), pero al no tener funciones `test_*` no se
colecciona nada de aqui.

No se debe importar nada de esto en tests/e2e/conftest.py (es del
orquestador). El patron correcto es al reves: los archivos test_api_*.py
importan de conftest (login, bearer, run_sql, sql_scalar) y de este modulo.
"""

from __future__ import annotations

import time
import uuid

RFC7807_KEYS = {"type", "title", "status", "detail", "traceId"}


def unique_tag() -> str:
    """Sufijo corto y unico (timestamp + random) para nombres/correos de
    datos de prueba, de forma que cada corrida no choque con la anterior ni
    con el seed. Prefijo recomendado en el dato real: `zz_e2e_<tag>`."""
    return f"{int(time.time())}{uuid.uuid4().hex[:6]}"


def assert_rfc7807(body: dict, expected_status: int) -> None:
    """Valida el envelope RFC 7807 documentado en docs/api-handover.md:
    {type, title, status, detail, traceId}."""
    missing = RFC7807_KEYS - body.keys()
    assert not missing, f"faltan claves RFC7807 {missing} en {body}"
    assert body["status"] == expected_status, body
    assert isinstance(body["detail"], str) and body["detail"], body
    assert isinstance(body["traceId"], str) and body["traceId"], body
    assert body["type"] == "about:blank", body
    assert isinstance(body["title"], str) and body["title"], body


def assert_page_envelope(body: dict) -> None:
    """Valida el envelope de paginacion documentado: {items, page, pageSize, total}."""
    assert set(body.keys()) == {"items", "page", "pageSize", "total"}, body
    assert isinstance(body["items"], list)
    assert isinstance(body["page"], int)
    assert isinstance(body["pageSize"], int)
    assert isinstance(body["total"], int)
    assert body["total"] >= len(body["items"])
