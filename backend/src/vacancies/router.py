from fastapi import APIRouter, Depends

from ..auth.service import TokenClaims
from ..auth.utils import require_role
from .schemas import VacancyAreasResponse, VacancyKeywordResponse, VacancySearchRequest, VacancySearchResponse
from .service import VacanciesService

router = APIRouter(prefix="/vacancies", tags=["Vacancies"])


@router.get("/areas", response_model=VacancyAreasResponse)
async def get_vacancy_areas(q: str = "", claims: TokenClaims = Depends(require_role("user", "curator", "admin"))):
    return await VacanciesService().get_areas(q)


@router.get("/keywords", response_model=VacancyKeywordResponse)
async def get_vacancy_keywords(q: str = "", claims: TokenClaims = Depends(require_role("user", "curator", "admin"))):
    return await VacanciesService().get_keywords(q)


@router.post("/search", response_model=VacancySearchResponse)
async def search_vacancies(
    payload: VacancySearchRequest,
    claims: TokenClaims = Depends(require_role("user", "curator", "admin")),
):
    return await VacanciesService().search_vacancies(payload)
