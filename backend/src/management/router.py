from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.schemas import EmailConfirmationResponse
from ..auth.service import TokenClaims
from ..auth.utils import require_role
from ..utils.database import get_db
from .schemas import (
    CuratorInvitationAvailabilityResponse,
    CuratorInvitationRequest,
    CuratorManagementResponse,
)
from .service import ManagementService

router = APIRouter(prefix="/management", tags=["Management"])


@router.get("/curators", response_model=CuratorManagementResponse)
async def list_curators(
    q: str = Query(default=""),
    page: int = Query(1, ge=1),
    limit: int = Query(7, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    return await ManagementService(db).list_curators(q, page, limit)


@router.get("/curator-invitations/availability", response_model=CuratorInvitationAvailabilityResponse)
async def check_curator_invitation_availability(
    email: str = Query(...),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    can_invite, reason = await ManagementService(db).can_invite_curator(email)
    return CuratorInvitationAvailabilityResponse(can_invite=can_invite, reason=reason)


@router.post("/curator-invitations", response_model=EmailConfirmationResponse)
async def request_curator_invitation(
    payload: CuratorInvitationRequest,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    message = await ManagementService(db).request_curator_invitation(payload.email)
    return EmailConfirmationResponse(message=message)


@router.delete("/curator-invitations", response_model=EmailConfirmationResponse)
async def cancel_curator_invitation(
    email: str = Query(...),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    await ManagementService(db).delete_invitation(email)
    return EmailConfirmationResponse(message="Приглашение отменено")


@router.patch("/curators/{user_id}/revoke", response_model=EmailConfirmationResponse)
async def revoke_curator_role(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    await ManagementService(db).revoke_curator_role(user_id)
    return EmailConfirmationResponse(message="Роль куратора отозвана")
