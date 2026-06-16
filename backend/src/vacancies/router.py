import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.service import TokenClaims
from ..auth.utils import require_role
from ..utils.database import get_db
from .schemas import (
    AnalyzeVacancyRequest,
    VacancyAnalysisResponse,
    VacancyAreasResponse,
    VacancyKeywordResponse,
    VacancySearchRequest,
    VacancySearchResponse,
)
from .service import VacanciesService

router = APIRouter(prefix="/vacancies", tags=["Vacancies"])


@router.get("/areas", response_model=VacancyAreasResponse)
async def get_vacancy_areas(q: str = "", claims: TokenClaims = Depends(require_role("user", "curator", "admin"))):
    return await VacanciesService().get_areas(q)


@router.get("/keywords", response_model=VacancyKeywordResponse)
async def get_vacancy_keywords(q: str = "", claims: TokenClaims = Depends(require_role("user", "curator", "admin"))):
    return await VacanciesService().get_keywords(q)


@router.post("/search", response_model=VacancySearchResponse)
async def search_vacancies(request: Request, claims: TokenClaims = Depends(require_role("user", "curator", "admin"))):
    try:
        raw_payload = await request.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="тело запроса должно быть JSON-объектом") from exc

    if isinstance(raw_payload, str):
        try:
            raw_payload = json.loads(raw_payload)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="тело запроса должно быть JSON-объектом") from exc
    if raw_payload is None:
        raw_payload = {}

    try:
        payload = VacancySearchRequest.model_validate(raw_payload)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=jsonable_encoder(exc.errors())) from exc

    return await VacanciesService().search_vacancies(payload)


@router.post("/analyze", response_model=VacancyAnalysisResponse)
async def analyze_vacancy(
    payload: AnalyzeVacancyRequest,
    claims: TokenClaims = Depends(require_role("user", "curator", "admin")),
    db: AsyncSession = Depends(get_db),
):
    return await VacanciesService().analyze_vacancy(db, claims.user_id, payload)


@router.get("/{vacancy_id}/analysis", response_model=VacancyAnalysisResponse)
async def get_vacancy_analysis(
    vacancy_id: int,
    claims: TokenClaims = Depends(require_role("user", "curator", "admin")),
    db: AsyncSession = Depends(get_db),
):
    return await VacanciesService().get_analysis(db, claims.user_id, vacancy_id)
