"""JWT issuing/verification (HS256, via PyJWT) and password hashing (bcrypt,
used directly - no passlib). Claims: sub, role ("owner"|"superadmin"),
tenantId (present only for role == "owner"), exp.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

import bcrypt
import jwt

Role = Literal["owner", "superadmin"]


class TokenError(Exception):
    """Raised for any invalid/expired/malformed JWT."""


@dataclass(frozen=True)
class TokenPayload:
    sub: str
    role: Role
    tenant_id: int | None = None


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(
    *,
    sub: str,
    role: Role,
    tenant_id: int | None,
    secret: str,
    algorithm: str = "HS256",
    expires_min: int = 60,
    now: datetime | None = None,
) -> str:
    issued_at = now or datetime.now(UTC)
    claims: dict[str, object] = {
        "sub": sub,
        "role": role,
        "iat": issued_at,
        "exp": issued_at + timedelta(minutes=expires_min),
    }
    if role == "owner" and tenant_id is not None:
        claims["tenantId"] = tenant_id
    return jwt.encode(claims, secret, algorithm=algorithm)


def decode_access_token(token: str, *, secret: str, algorithm: str = "HS256") -> TokenPayload:
    try:
        claims = jwt.decode(token, secret, algorithms=[algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("invalid token") from exc

    role = claims.get("role")
    sub = claims.get("sub")
    if role not in ("owner", "superadmin") or not sub:
        raise TokenError("token missing required claims")

    tenant_id = claims.get("tenantId")
    return TokenPayload(sub=str(sub), role=role, tenant_id=tenant_id)
