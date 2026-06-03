from fastapi import APIRouter, Depends

from ..auth.service import TokenClaims
from ..auth.utils import require_role
from .schemas import VacancyAreasResponse, VacancySearchRequest, VacancySearchResponse
from .service import VacanciesService

router = APIRouter(prefix="/vacancies", tags=["Vacancies"])


@router.get("/areas", response_model=VacancyAreasResponse)
async def get_vacancy_areas(q: str = "", claims: TokenClaims = Depends(require_role("user", "curator", "admin"))):
    return await VacanciesService().get_areas(q)


@router.post("/search", response_model=VacancySearchResponse)
async def search_vacancies(
    payload: VacancySearchRequest,
    claims: TokenClaims = Depends(require_role("user", "curator", "admin")),
):
    return await VacanciesService().search_vacancies(payload)
