from pydantic import BaseModel, Field, field_validator


HH_EXPERIENCE_IDS = {
    "noExperience",
    "between1And3",
    "between3And6",
    "moreThan6",
}


class VacancyAreaItem(BaseModel):
    id: str
    name: str
    full_name: str


class VacancyAreasResponse(BaseModel):
    items: list[VacancyAreaItem]


class SalaryId(BaseModel):
    id: str

class SalaryRange(BaseModel):
    currency: str = "RUR"
    frequency: SalaryId | None = None
    from_: int | None = Field(default=None, alias="from")
    gross: bool = False
    mode: SalaryId | None = None
    to: int | None = None

class VacancySearchRequest(BaseModel):
    description: str = Field(default="", max_length=255)
    excluded_words: str = Field(default="", max_length=255)
    salary_range: SalaryRange | None = None
    area_ids: list[str] = Field(default_factory=list)
    experience: list[str] = Field(default_factory=list)
    schedule: list[str] = Field(default_factory=list)
    education: list[str] = Field(default_factory=list)
    accredited_it_employer: bool = Field(default=False)
    less_than_10_negotiations: bool = Field(default=False)
    only_with_salary: bool = Field(default=False)
    page: int = Field(default=0, ge=0)

    @field_validator("description", "excluded_words", mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str:
        return (value or "").strip()

    @field_validator("area_ids", mode="before")
    @classmethod
    def normalize_area_ids(cls, value: list[str] | None) -> list[str]:
        if not value:
            return []

        unique_ids: list[str] = []
        seen_ids: set[str] = set()
        for item in value:
            normalized_item = str(item).strip()
            if not normalized_item or normalized_item in seen_ids:
                continue
            seen_ids.add(normalized_item)
            unique_ids.append(normalized_item)
        return unique_ids

    @field_validator("experience", mode="before")
    @classmethod
    def validate_experience(cls, value: Any) -> list[str]:
        if value is None or value == "":
            return []
        if isinstance(value, str):
            value = [value]
        if not isinstance(value, list):
            raise ValueError("опыт должен быть списком строк")
        cleaned = []
        for item in value:
            if not item:
                continue
            item_str = str(item).strip()
            if item_str not in HH_EXPERIENCE_IDS:
                raise ValueError(f"неизвестное значение опыта: {item_str}")
            cleaned.append(item_str)
        return cleaned


class VacancySearchItem(BaseModel):
    id: str
    title: str
    salary_text: str
    tags: list[str]
    employer_name: str
    original_url: str


class VacancySearchResponse(BaseModel):
    items: list[VacancySearchItem]
    found: int
