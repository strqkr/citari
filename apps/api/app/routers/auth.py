"""Authentication endpoints (endpoints.auth.*): login, owner
self-registration, current-user lookup, and logout."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.config import Settings, get_settings
from app.deps import CurrentUser, DbConnection
from app.repositories.superadmin_repository import SuperadminRepository
from app.repositories.tenant_owner_repository import TenantOwnerRepository
from app.repositories.tenant_repository import TenantRepository
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    RegisterOwnerRequest,
    RegisterOwnerResponse,
    TokenResponse,
    UserResponse,
)
from app.security import create_access_token, hash_password
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_service(db: DbConnection) -> AuthService:
    return AuthService(TenantOwnerRepository(db), SuperadminRepository(db), TenantRepository(db))


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    db: DbConnection,
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenResponse:
    user = _auth_service(db).authenticate(
        email=payload.email, password=payload.password, role=payload.role
    )
    token = create_access_token(
        sub=str(user["id"]),
        role=user["role"],
        tenant_id=user.get("tenant_id"),
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        expires_min=settings.jwt_expires_min,
    )
    return TokenResponse(access_token=token, user=UserResponse(**user))


@router.post("/register-owner", response_model=RegisterOwnerResponse, status_code=201)
def register_owner(payload: RegisterOwnerRequest, db: DbConnection) -> RegisterOwnerResponse:
    password_hash = hash_password(payload.password)
    result = _auth_service(db).register_owner(
        business_name=payload.business_name,
        business_type_id=payload.business_type_id,
        slug=payload.slug,
        business_email=payload.business_email,
        owner_first_name=payload.owner_first_name,
        owner_last_name=payload.owner_last_name,
        owner_email=payload.owner_email,
        password_hash=password_hash,
        phone=payload.phone,
    )
    return RegisterOwnerResponse(
        tenant_id=result["tenant_id"],
        owner=UserResponse(**result["owner"]),
        message=("El dominio ha sido creado y queda pendiente de activacion por un superadmin."),
    )


@router.get("/me", response_model=MeResponse)
def me(token: CurrentUser, db: DbConnection) -> MeResponse:
    user = _auth_service(db).get_current_user(role=token.role, subject_id=int(token.sub))
    return MeResponse(**user)


@router.post("/logout", status_code=204)
def logout() -> Response:
    """Stateless logout: JWTs are not tracked server-side in this WP (no
    revocation list/session store), so there is nothing to invalidate here -
    the client is solely responsible for discarding the token it holds."""
    return Response(status_code=204)
