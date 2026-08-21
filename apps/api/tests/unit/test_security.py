"""JWT issuing/verification and bcrypt password hashing."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.security import (
    TokenError,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_and_verify_password_roundtrip() -> None:
    password_hash = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", password_hash) is True


def test_verify_password_rejects_wrong_password() -> None:
    password_hash = hash_password("correct horse battery staple")
    assert verify_password("wrong password", password_hash) is False


def test_verify_password_rejects_malformed_hash() -> None:
    assert verify_password("anything", "not-a-real-bcrypt-hash") is False


def test_create_and_decode_owner_token(jwt_secret: str) -> None:
    token = create_access_token(
        sub="owner-1", role="owner", tenant_id=99, secret=jwt_secret, expires_min=60
    )

    payload = decode_access_token(token, secret=jwt_secret)

    assert payload.sub == "owner-1"
    assert payload.role == "owner"
    assert payload.tenant_id == 99


def test_create_and_decode_superadmin_token_has_no_tenant_id(jwt_secret: str) -> None:
    token = create_access_token(
        sub="admin-1", role="superadmin", tenant_id=None, secret=jwt_secret, expires_min=60
    )

    payload = decode_access_token(token, secret=jwt_secret)

    assert payload.role == "superadmin"
    assert payload.tenant_id is None


def test_decode_expired_token_raises_token_error(jwt_secret: str) -> None:
    issued_in_the_past = datetime.now(UTC) - timedelta(hours=2)
    token = create_access_token(
        sub="owner-1",
        role="owner",
        tenant_id=1,
        secret=jwt_secret,
        expires_min=60,
        now=issued_in_the_past,
    )

    with pytest.raises(TokenError):
        decode_access_token(token, secret=jwt_secret)


def test_decode_token_with_wrong_secret_raises_token_error(jwt_secret: str) -> None:
    token = create_access_token(
        sub="owner-1", role="owner", tenant_id=1, secret=jwt_secret, expires_min=60
    )

    with pytest.raises(TokenError):
        decode_access_token(token, secret="a-completely-different-secret")


def test_decode_token_missing_role_claim_raises_token_error(jwt_secret: str) -> None:
    import jwt as pyjwt

    token = pyjwt.encode({"sub": "owner-1"}, jwt_secret, algorithm="HS256")

    with pytest.raises(TokenError):
        decode_access_token(token, secret=jwt_secret)
