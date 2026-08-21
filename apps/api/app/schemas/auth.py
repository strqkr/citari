"""Wire contracts for /auth/*.

No dedicated frontend type file exists yet for the `user` shape
(apps/frontend/types/ has no auth.ts) - field names mirror the established
firstName/lastName convention (see apps/frontend/types/customer.ts) plus the
JWT's own role/tenantId claims (app.security.TokenPayload).

NOTE: email fields are plain `str` (not pydantic.EmailStr) on purpose: the
runtime dependency list does not include the optional `email-validator`
package that EmailStr requires. Format validation, if needed, happens in the
service layer.
"""

from __future__ import annotations

from typing import Literal

from app.schemas.common import CamelModel


class LoginRequest(CamelModel):
    email: str
    password: str
    # Optional hint for which table to look the email up in first; see
    # app.services.auth_service.AuthService.authenticate for the exact
    # resolution order when omitted.
    role: Literal["owner", "superadmin"] | None = None


class UserResponse(CamelModel):
    id: int
    first_name: str
    last_name: str
    email: str
    role: Literal["owner", "superadmin"]
    # Present only for role == "owner" (never set for superadmin).
    tenant_id: int | None = None


class TokenResponse(CamelModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class RegisterOwnerRequest(CamelModel):
    business_name: str
    business_type_id: int
    slug: str
    business_email: str
    owner_first_name: str
    owner_last_name: str
    owner_email: str
    password: str
    phone: str | None = None


class RegisterOwnerResponse(CamelModel):
    tenant_id: int
    owner: UserResponse
    message: str


class MeResponse(UserResponse):
    """GET /auth/me returns exactly the same shape as TokenResponse.user."""
