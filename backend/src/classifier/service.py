from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import ProfStandard, PsFunction, PsFunctionsGroup
from .schemas import (
    ClassifierTreeResponse,
    ProfStandardCreateUpdate,
    ProfStandardDetail,
    ProfStandardTreeItem,
    PsFunctionCreateUpdate,
    PsFunctionDetail,
    PsFunctionParentGroup,
    PsFunctionParentStandard,
    PsFunctionSummary,
    PsFunctionTreeItem,
    PsFunctionsGroupCreateUpdate,
    PsFunctionsGroupDetail,
    PsFunctionsGroupParent,
    PsFunctionsGroupSummary,
    PsFunctionsGroupTreeItem,
)


CYRILLIC_CODE_MAP = str.maketrans({
    "А": "A",
    "В": "B",
    "С": "C",
    "Е": "E",
    "Н": "H",
    "К": "K",
    "М": "M",
    "О": "O",
    "Р": "P",
    "Т": "T",
    "Х": "X",
})


def normalize_group_code(code: str) -> str:
    normalized = code.strip().upper().translate(CYRILLIC_CODE_MAP)
    if len(normalized) != 1 or normalized < "A" or normalized > "Z":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Код ОТФ должен быть буквой от A до Z",
        )
    return normalized


def validate_name(name: str) -> str:
    trimmed = name.strip()
    if not trimmed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Название не может быть пустым",
        )
    if len(trimmed) > 256:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Название не может быть длиннее 256 символов",
        )
    return trimmed


def group_code_by_index(index: int) -> str:
    if index < 0 or index > 25:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="В профессиональном стандарте может быть не более 26 ОТФ",
        )
    return chr(ord("A") + index)


class ClassifierService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_tree(self, query: str | None) -> ClassifierTreeResponse:
        result = await self.db.execute(
            select(ProfStandard)
            .options(
                selectinload(ProfStandard.functions_groups).selectinload(PsFunctionsGroup.functions)
            )
            .order_by(ProfStandard.code)
        )
        standards = result.scalars().all()
        needle = (query or "").strip().lower()

        items: list[ProfStandardTreeItem] = []
        for standard in standards:
            groups = sorted(
                standard.functions_groups,
                key=lambda group: normalize_group_code(group.code),
            )
            group_items: list[PsFunctionsGroupTreeItem] = []
            standard_match = self._matches_standard(standard, needle)

            for group in groups:
                functions = sorted(group.functions, key=lambda function: function.code)
                group_match = self._matches_group(standard, group, needle)
                function_items = [
                    PsFunctionTreeItem(id=function.id, code=function.code, name=function.name)
                    for function in functions
                    if standard_match or group_match or self._matches_function(standard, group, function, needle)
                ]

                if standard_match or group_match or function_items:
                    group_items.append(PsFunctionsGroupTreeItem(
                        id=group.id,
                        code=normalize_group_code(group.code),
                        name=group.name,
                        qualification_level=group.qualification_level,
                        functions=function_items if needle else [
                            PsFunctionTreeItem(id=function.id, code=function.code, name=function.name)
                            for function in functions
                        ],
                    ))

            if standard_match or group_items or not needle:
                items.append(ProfStandardTreeItem(
                    id=standard.id,
                    code=standard.code,
                    name=standard.name,
                    groups=group_items if needle else [
                        PsFunctionsGroupTreeItem(
                            id=group.id,
                            code=normalize_group_code(group.code),
                            name=group.name,
                            qualification_level=group.qualification_level,
                            functions=[
                                PsFunctionTreeItem(id=function.id, code=function.code, name=function.name)
                                for function in sorted(group.functions, key=lambda function: function.code)
                            ],
                        )
                        for group in groups
                    ],
                ))

        return ClassifierTreeResponse(items=items)

    async def get_prof_standard(self, ps_id: int) -> ProfStandardDetail:
        standard = await self._get_prof_standard(ps_id)
        groups = sorted(standard.functions_groups, key=lambda group: normalize_group_code(group.code))
        return ProfStandardDetail(
            id=standard.id,
            code=standard.code,
            name=standard.name,
            description=standard.description,
            groups=[
                PsFunctionsGroupSummary(
                    id=group.id,
                    code=normalize_group_code(group.code),
                    name=group.name,
                    qualification_level=group.qualification_level,
                )
                for group in groups
            ],
        )

    async def create_prof_standard(self, data: ProfStandardCreateUpdate) -> ProfStandardDetail:
        await self._ensure_standard_code_available(data.code)
        standard = ProfStandard(
            code=data.code,
            name=validate_name(data.name),
            description=data.description,
        )
        self.db.add(standard)
        await self.db.commit()
        return await self.get_prof_standard(standard.id)

    async def update_prof_standard(self, ps_id: int, data: ProfStandardCreateUpdate) -> ProfStandardDetail:
        standard = await self._get_prof_standard(ps_id)
        await self._ensure_standard_code_available(data.code, exclude_id=ps_id)
        standard.code = data.code
        standard.name = validate_name(data.name)
        standard.description = data.description

        if data.groups is not None:
            await self._apply_group_order(standard, data.groups)

        await self.db.commit()
        return await self.get_prof_standard(ps_id)

    async def delete_prof_standard(self, ps_id: int):
        standard = await self._get_prof_standard(ps_id)
        await self.db.delete(standard)
        await self.db.commit()

    async def create_group(self, ps_id: int, data: PsFunctionsGroupCreateUpdate) -> PsFunctionsGroupDetail:
        await self._get_prof_standard(ps_id)
        code = normalize_group_code(data.code)
        await self._ensure_group_code_available(ps_id, code)
        group = PsFunctionsGroup(
            ps_id=ps_id,
            code=code,
            name=validate_name(data.name),
            qualification_level=data.qualification_level,
        )
        self.db.add(group)
        await self.db.commit()
        return await self.get_group(group.id)

    async def get_group(self, group_id: int) -> PsFunctionsGroupDetail:
        group = await self._get_group(group_id)
        functions = sorted(group.functions, key=lambda function: function.code)
        return PsFunctionsGroupDetail(
            id=group.id,
            code=normalize_group_code(group.code),
            name=group.name,
            qualification_level=group.qualification_level,
            prof_standard=PsFunctionsGroupParent(
                id=group.prof_standard.id,
                code=group.prof_standard.code,
                name=group.prof_standard.name,
            ),
            functions=[
                PsFunctionSummary(id=function.id, code=function.code, name=function.name)
                for function in functions
            ],
        )

    async def update_group(self, group_id: int, data: PsFunctionsGroupCreateUpdate) -> PsFunctionsGroupDetail:
        group = await self._get_group(group_id)
        code = normalize_group_code(data.code)
        await self._ensure_group_code_available(group.ps_id, code, exclude_id=group_id)
        group.code = code
        group.name = validate_name(data.name)
        group.qualification_level = data.qualification_level

        if data.functions is not None:
            await self._apply_function_order(group, data.functions)

        await self.db.commit()
        return await self.get_group(group_id)

    async def delete_group(self, group_id: int):
        group = await self._get_group(group_id)
        await self.db.delete(group)
        await self.db.commit()

    async def create_function(self, group_id: int, data: PsFunctionCreateUpdate) -> PsFunctionDetail:
        await self._get_group(group_id)
        await self._ensure_function_code_available(group_id, data.code)
        function = PsFunction(
            ps_functions_group_id=group_id,
            code=data.code,
            name=validate_name(data.name),
        )
        self.db.add(function)
        await self.db.commit()
        return await self.get_function(function.id)

    async def get_function(self, function_id: int) -> PsFunctionDetail:
        function = await self._get_function(function_id)
        group = function.functions_group
        standard = group.prof_standard
        return PsFunctionDetail(
            id=function.id,
            code=function.code,
            name=function.name,
            functions_group=PsFunctionParentGroup(
                id=group.id,
                code=normalize_group_code(group.code),
                name=group.name,
                qualification_level=group.qualification_level,
            ),
            prof_standard=PsFunctionParentStandard(
                id=standard.id,
                code=standard.code,
                name=standard.name,
            ),
        )

    async def update_function(self, function_id: int, data: PsFunctionCreateUpdate) -> PsFunctionDetail:
        function = await self._get_function(function_id)
        await self._ensure_function_code_available(
            function.ps_functions_group_id,
            data.code,
            exclude_id=function_id,
        )
        function.code = data.code
        function.name = validate_name(data.name)
        await self.db.commit()
        return await self.get_function(function_id)

    async def delete_function(self, function_id: int):
        function = await self._get_function(function_id)
        await self.db.delete(function)
        await self.db.commit()

    async def _apply_group_order(self, standard: ProfStandard, groups: list[PsFunctionsGroupSummary]):
        if len(groups) > 26:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="В профессиональном стандарте может быть не более 26 ОТФ",
            )

        existing = {group.id: group for group in standard.functions_groups}
        if set(existing) != {group.id for group in groups}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Список ОТФ не соответствует профессиональному стандарту",
            )

        for group in standard.functions_groups:
            group.code = f"tmp_{group.id}"
        await self.db.flush()

        for index, item in enumerate(groups):
            group = existing[item.id]
            group.code = group_code_by_index(index)
            group.name = validate_name(item.name)
            group.qualification_level = item.qualification_level

    async def _apply_function_order(self, group: PsFunctionsGroup, functions: list[PsFunctionSummary]):
        existing = {function.id: function for function in group.functions}
        if set(existing) != {function.id for function in functions}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Список ТФ не соответствует ОТФ",
            )

        for function in group.functions:
            function.code = function.id * -1
        await self.db.flush()

        for index, item in enumerate(functions):
            function = existing[item.id]
            function.code = index + 1
            function.name = validate_name(item.name)

    async def _get_prof_standard(self, ps_id: int) -> ProfStandard:
        result = await self.db.execute(
            select(ProfStandard)
            .options(
                selectinload(ProfStandard.functions_groups).selectinload(PsFunctionsGroup.functions)
            )
            .where(ProfStandard.id == ps_id)
        )
        standard = result.scalar_one_or_none()
        if standard is None:
            raise HTTPException(status_code=404, detail="Профессиональный стандарт не найден")
        return standard

    async def _get_group(self, group_id: int) -> PsFunctionsGroup:
        result = await self.db.execute(
            select(PsFunctionsGroup)
            .options(
                selectinload(PsFunctionsGroup.prof_standard),
                selectinload(PsFunctionsGroup.functions),
            )
            .where(PsFunctionsGroup.id == group_id)
        )
        group = result.scalar_one_or_none()
        if group is None:
            raise HTTPException(status_code=404, detail="ОТФ не найдена")
        return group

    async def _get_function(self, function_id: int) -> PsFunction:
        result = await self.db.execute(
            select(PsFunction)
            .options(
                selectinload(PsFunction.functions_group).selectinload(PsFunctionsGroup.prof_standard)
            )
            .where(PsFunction.id == function_id)
        )
        function = result.scalar_one_or_none()
        if function is None:
            raise HTTPException(status_code=404, detail="ТФ не найдена")
        return function

    async def _ensure_standard_code_available(self, code: int, exclude_id: int | None = None):
        query = select(ProfStandard.id).where(ProfStandard.code == code)
        if exclude_id is not None:
            query = query.where(ProfStandard.id != exclude_id)
        if await self.db.scalar(query):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Профессиональный стандарт с таким кодом уже существует",
            )

    async def _ensure_group_code_available(self, ps_id: int, code: str, exclude_id: int | None = None):
        query = select(PsFunctionsGroup.id).where(
            PsFunctionsGroup.ps_id == ps_id,
            func.upper(PsFunctionsGroup.code) == code,
        )
        if exclude_id is not None:
            query = query.where(PsFunctionsGroup.id != exclude_id)
        if await self.db.scalar(query):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="ОТФ с таким кодом уже существует в этом профессиональном стандарте",
            )

    async def _ensure_function_code_available(self, group_id: int, code: int, exclude_id: int | None = None):
        query = select(PsFunction.id).where(
            PsFunction.ps_functions_group_id == group_id,
            PsFunction.code == code,
        )
        if exclude_id is not None:
            query = query.where(PsFunction.id != exclude_id)
        if await self.db.scalar(query):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="ТФ с таким кодом уже существует в этой ОТФ",
            )

    def _matches_standard(self, standard: ProfStandard, needle: str) -> bool:
        if not needle:
            return True
        return needle in f"06.{standard.code:03d}".lower() or needle in standard.name.lower()

    def _matches_group(self, standard: ProfStandard, group: PsFunctionsGroup, needle: str) -> bool:
        if not needle:
            return True
        code = normalize_group_code(group.code)
        standard_code = f"06.{standard.code:03d}/{code}".lower()
        return needle in standard_code or needle in code.lower() or needle in group.name.lower()

    def _matches_function(
        self,
        standard: ProfStandard,
        group: PsFunctionsGroup,
        function: PsFunction,
        needle: str,
    ) -> bool:
        if not needle:
            return True
        code = normalize_group_code(group.code)
        full_code = f"06.{standard.code:03d}/{code}/{function.code:02d}.{group.qualification_level}".lower()
        return needle in full_code or needle in function.name.lower()
