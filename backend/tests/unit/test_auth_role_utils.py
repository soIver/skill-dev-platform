import asyncio

import pytest
from fastapi import HTTPException

from src.auth.service import TokenClaims
from src.auth.utils import require_role, resolve_author_filter


def claims(role: str, user_id: int = 1) -> TokenClaims:
    return TokenClaims(
        user_id=user_id,
        username=role,
        email=f"{role}@example.com",
        role=role,
        jti=role,
    )


def test_resolve_author_filter_allows_admin_and_owner_curator():
    assert resolve_author_filter(claims("admin"), 99) == 99
    assert resolve_author_filter(claims("curator", 2), 2) == 2
    assert resolve_author_filter(claims("curator"), None) is None


def test_resolve_author_filter_rejects_foreign_curator_and_user():
    with pytest.raises(HTTPException) as curator_error:
        resolve_author_filter(claims("curator", 2), 5)
    with pytest.raises(HTTPException) as user_error:
        resolve_author_filter(claims("user"), 1)

    assert curator_error.value.status_code == 403
    assert user_error.value.status_code == 403


def test_require_role_allows_matching_role_and_rejects_other_role():
    checker = require_role("admin")

    assert asyncio.run(checker(claims("admin"))) == claims("admin")

    with pytest.raises(HTTPException) as error:
        asyncio.run(checker(claims("user")))

    assert error.value.status_code == 403
