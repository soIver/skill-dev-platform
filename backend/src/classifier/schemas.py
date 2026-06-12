from pydantic import BaseModel, Field


class PsFunctionTreeItem(BaseModel):
    id: int
    code: int
    name: str


class PsFunctionsGroupTreeItem(BaseModel):
    id: int
    code: str
    name: str
    qualification_level: int
    functions: list[PsFunctionTreeItem]


class ProfStandardTreeItem(BaseModel):
    id: int
    code: int
    name: str
    groups: list[PsFunctionsGroupTreeItem]


class ClassifierTreeResponse(BaseModel):
    items: list[ProfStandardTreeItem]


class PsFunctionsGroupSummary(BaseModel):
    id: int
    code: str
    name: str
    qualification_level: int


class PsFunctionSummary(BaseModel):
    id: int
    code: int
    name: str


class ProfStandardCreateUpdate(BaseModel):
    code: int = Field(..., ge=0, le=999)
    name: str = Field(..., min_length=1, max_length=256)
    description: str | None = None
    groups: list[PsFunctionsGroupSummary] | None = None


class PsFunctionsGroupCreateUpdate(BaseModel):
    code: str = Field(..., min_length=1, max_length=1)
    name: str = Field(..., min_length=1, max_length=256)
    qualification_level: int = Field(..., ge=1, le=9)
    functions: list[PsFunctionSummary] | None = None


class PsFunctionCreateUpdate(BaseModel):
    code: int = Field(..., ge=1, le=99)
    name: str = Field(..., min_length=1, max_length=256)


class ProfStandardDetail(BaseModel):
    id: int
    code: int
    name: str
    description: str | None
    groups: list[PsFunctionsGroupSummary]


class PsFunctionsGroupParent(BaseModel):
    id: int
    code: int
    name: str


class PsFunctionsGroupDetail(BaseModel):
    id: int
    code: str
    name: str
    qualification_level: int
    prof_standard: PsFunctionsGroupParent
    functions: list[PsFunctionSummary]


class PsFunctionParentGroup(BaseModel):
    id: int
    code: str
    name: str
    qualification_level: int


class PsFunctionParentStandard(BaseModel):
    id: int
    code: int
    name: str


class PsFunctionDetail(BaseModel):
    id: int
    code: int
    name: str
    functions_group: PsFunctionParentGroup
    prof_standard: PsFunctionParentStandard
