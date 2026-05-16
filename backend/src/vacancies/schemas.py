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


class VacancySearchRequest(BaseModel):
    description: str = Field(default="", max_length=255)
    excluded_words: str = Field(default="", max_length=255)
    salary_from: int | None = Field(default=None, ge=0)
    area_ids: list[str] = Field(default_factory=list)
    experience: str | None = Field(default=None)

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

    @field_validator("experience")
    @classmethod
    def validate_experience(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        if value not in HH_EXPERIENCE_IDS:
            raise ValueError("Неизвестное значение опыта")
        return value


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
