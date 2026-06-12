from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.service import TokenClaims
from ..auth.utils import require_role
from ..utils.database import get_db
from .schemas import (
    ClassifierTreeResponse,
    ProfStandardCreateUpdate,
    ProfStandardDetail,
    PsFunctionCreateUpdate,
    PsFunctionDetail,
    PsFunctionsGroupCreateUpdate,
    PsFunctionsGroupDetail,
)
from .service import ClassifierService

router = APIRouter(prefix="/classifier", tags=["Classifier"])


@router.get("/tree", response_model=ClassifierTreeResponse)
async def get_classifier_tree(
    query: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    return await ClassifierService(db).get_tree(query)


@router.get("/prof-standards/{ps_id}", response_model=ProfStandardDetail)
async def get_prof_standard(
    ps_id: int,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    return await ClassifierService(db).get_prof_standard(ps_id)


@router.post("/prof-standards", response_model=ProfStandardDetail)
async def create_prof_standard(
    data: ProfStandardCreateUpdate,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    return await ClassifierService(db).create_prof_standard(data)


@router.put("/prof-standards/{ps_id}", response_model=ProfStandardDetail)
async def update_prof_standard(
    ps_id: int,
    data: ProfStandardCreateUpdate,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    return await ClassifierService(db).update_prof_standard(ps_id, data)


@router.delete("/prof-standards/{ps_id}")
async def delete_prof_standard(
    ps_id: int,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    await ClassifierService(db).delete_prof_standard(ps_id)
    return {"status": "ok"}


@router.post("/prof-standards/{ps_id}/groups", response_model=PsFunctionsGroupDetail)
async def create_group(
    ps_id: int,
    data: PsFunctionsGroupCreateUpdate,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    return await ClassifierService(db).create_group(ps_id, data)


@router.get("/groups/{group_id}", response_model=PsFunctionsGroupDetail)
async def get_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    return await ClassifierService(db).get_group(group_id)


@router.put("/groups/{group_id}", response_model=PsFunctionsGroupDetail)
async def update_group(
    group_id: int,
    data: PsFunctionsGroupCreateUpdate,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    return await ClassifierService(db).update_group(group_id, data)


@router.delete("/groups/{group_id}")
async def delete_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    await ClassifierService(db).delete_group(group_id)
    return {"status": "ok"}


@router.post("/groups/{group_id}/functions", response_model=PsFunctionDetail)
async def create_function(
    group_id: int,
    data: PsFunctionCreateUpdate,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    return await ClassifierService(db).create_function(group_id, data)


@router.get("/functions/{function_id}", response_model=PsFunctionDetail)
async def get_function(
    function_id: int,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    return await ClassifierService(db).get_function(function_id)


@router.put("/functions/{function_id}", response_model=PsFunctionDetail)
async def update_function(
    function_id: int,
    data: PsFunctionCreateUpdate,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    return await ClassifierService(db).update_function(function_id, data)


@router.delete("/functions/{function_id}")
async def delete_function(
    function_id: int,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    await ClassifierService(db).delete_function(function_id)
    return {"status": "ok"}
