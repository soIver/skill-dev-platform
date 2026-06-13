import json
import re
from dataclasses import dataclass
from typing import List, Tuple, Dict

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from gitingest import ingest_async

from ..models import Skill
from ..utils.logger import get_logger
from .utils import CONFIG_PATH, get_embedding, get_completion, analysis_config

logger = get_logger("analysis.models")


@dataclass(slots=True)
class RepositoryPayload:
    payload: str
    tokens: int | None


@dataclass(slots=True)
class ExtractedAnalysis:
    skills: List[Tuple[str, int]]
    failed_requirement_ids: list[int]


class RepositoryTooLargeError(ValueError):
    def __init__(self, actual_tokens: int | None, max_tokens: int):
        self.actual_tokens = actual_tokens
        self.max_tokens = max_tokens
        super().__init__("Репозиторий слишком большой для автоматического анализа.")


class RepoAnalyzer:
    DISTANCE_TRESHOLD = 0.3
    TOKEN_COUNT_PATTERN = re.compile(
        r"(?:estimated\s+tokens|tokens)\s*:\s*([\d\s,._\u00a0]+)([kKmM]?)",
        re.IGNORECASE,
    )

    def __init__(self):
        self.config = analysis_config

    @property
    def max_payload_tokens(self) -> int:
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as config_file:
                config = yaml.safe_load(config_file) or {}
        except OSError:
            config = self.config

        return int(config.get("limits", {}).get("max_repository_payload_tokens", 130000))

    @staticmethod
    def _parse_numeric_token_value(raw_value: str, suffix: str) -> int | None:
        normalized = (
            raw_value
            .replace("\u00a0", " ")
            .replace("_", "")
            .replace(" ", "")
            .strip()
        )
        if not normalized:
            return None

        if suffix:
            try:
                value = float(normalized.replace(",", "."))
            except ValueError:
                return None

            multiplier = 1_000 if suffix.lower() == "k" else 1_000_000
            return int(value * multiplier)

        if re.fullmatch(r"\d{1,3}([,\.]\d{3})+", normalized):
            return int(re.sub(r"[,\.]", "", normalized))

        digits_only = normalized.replace(",", "").replace(".", "")
        if digits_only.isdigit():
            return int(digits_only)

        return None

    @classmethod
    def _extract_token_count(cls, summary: str) -> int | None:
        match = cls.TOKEN_COUNT_PATTERN.search(summary)
        if not match:
            return None

        raw_value, suffix = match.groups()
        return cls._parse_numeric_token_value(raw_value, suffix)

    def is_repository_too_large(self, tokens: int | None) -> bool:
        return (
            tokens is not None
            and self.max_payload_tokens > 0
            and tokens > self.max_payload_tokens
        )

    def _build_prompt(
        self,
        skill_names: List[str] | None = None,
        task_description: str | None = None,
        task_requirements: list[dict] | None = None,
    ) -> str:
        # сборка промпта из фрагментов, хранящихся в конфиге YAML
        prompts = self.config["prompts"]
        fragments = [prompts["role"]]

        if task_description:
            fragments.append(prompts["task_context"].format(description=task_description))

        if task_requirements:
            requirements = "\n".join(
                f"- {item['id']}: {item['description']}"
                for item in task_requirements
            )
            fragments.append(prompts["task_requirements"].format(requirements=requirements))

        if skill_names:
            task = prompts["task_with_skills"].format(skills=", ".join(skill_names))
            fragments.append(task)
        else:
            fragments.append(prompts["base_task"])

        fragments.append(prompts["scoring"])
        fragments.append(prompts["format"])

        return "\n\n".join(fragments)

    async def ingest_repository(self, url: str) -> RepositoryPayload:
        logger.info(f"Начата обработка репозитория {url}")
        ignore_patterns = self.config.get("ignore_patterns", [])
        summary, tree, content = await ingest_async(url, exclude_patterns=ignore_patterns)
        payload = f"{tree}\n\n{content}"
        tokens = self._extract_token_count(summary)
        if tokens is None:
            logger.warning("Не удалось извлечь оценку токенов из summary gitingest")
        else:
            logger.debug(f"Оценочный размер подготовленного содержимого репозитория: {tokens} токенов")
        return RepositoryPayload(payload=payload, tokens=tokens)

    async def extract_skills(
        self, 
        payload: str, 
        skill_names: List[str] | None = None,
        task_description: str | None = None,
        task_requirements: list[dict] | None = None,
    ) -> ExtractedAnalysis:
        prompt = self._build_prompt(skill_names, task_description, task_requirements)

        model = self.config["models"]["llm"]["name"]
        
        logger.debug(f"Отправка запроса модели {model}")
        content = await get_completion(prompt=prompt, payload=payload)
        if not content:
            return ExtractedAnalysis(skills=[], failed_requirement_ids=[])

        try:
            # очистка от возможных markdown-тегов
            content = content.strip()
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            
            data = json.loads(content)
            skills = []
            for item in data.get("skills", []):
                name = item.get("name")
                score = item.get("score")
                if name and isinstance(score, int) and 0 <= score <= 100:
                    if skill_names and name not in skill_names:
                        logger.debug(f"Отсеян навык '{name}', так как он не был запрошен")
                        continue
                    skills.append((name, score))
            requirement_ids = [
                int(item["id"])
                for item in task_requirements or []
            ]
            requirement_id_set = set(requirement_ids)
            failed_requirement_ids = []
            for requirement_id in data.get("failed_requirement_ids", []):
                if isinstance(requirement_id, int) and requirement_id in requirement_id_set:
                    failed_requirement_ids.append(requirement_id)
            if task_requirements and not skills and not failed_requirement_ids:
                failed_requirement_ids = requirement_ids
            
            logger.debug(f"Извлечено {len(skills)} навыков")
            logger.debug(skills)
            return ExtractedAnalysis(
                skills=skills,
                failed_requirement_ids=list(dict.fromkeys(failed_requirement_ids)),
            )
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.error(f"Ошибка при парсинге JSON от LLM: {e}")
            logger.debug(f"Raw content: {content}")
            return ExtractedAnalysis(skills=[], failed_requirement_ids=[])

    async def match_skills(self, db: AsyncSession, extracted_skills: List[Tuple[str, int]], threshold: float) -> List[Dict]:
        matched = []
        for skill_name, score in extracted_skills:
            vector = await get_embedding(skill_name)
            
            # используем pgvector <-> оператор для вычисления косинусного расстояния
            # чтобы найти ближайший по смыслу навык в БД
            query = select(Skill).order_by(Skill.embedding.cosine_distance(vector)).limit(1)
            result = await db.execute(query)
            closest_skill = result.scalar_one_or_none()

            if closest_skill and closest_skill.embedding is not None:
                # получаем конкретное значение расстояния, чтобы применить порог
                dist_query = select(Skill.embedding.cosine_distance(vector)).where(Skill.id == closest_skill.id)
                dist_result = await db.execute(dist_query)
                dist = dist_result.scalar_one_or_none()
                
                if dist is not None and dist <= threshold:
                    logger.debug(f"Сопоставлен '{skill_name}' с '{closest_skill.name}' (расстояние: {dist:.3f})")
                    matched.append({
                        "skill_id": closest_skill.id,
                        "score": score
                    })
                else:
                    logger.debug(f"Отсеян '{skill_name}' по порогу (ближайший: '{closest_skill.name}', расстояние: {dist:.3f} > {threshold})")
            else:
                 logger.debug(f"Отклонён '{skill_name}' (эмбеддинги не найдены в БД)")

        return matched

    async def analyze(
        self, 
        repo_url: str, 
        db: AsyncSession, 
        skill_names: List[str] | None = None,
        task_description: str | None = None,
        task_requirements: list[dict] | None = None,
    ) -> List[Dict]:
        repository_payload = await self.ingest_repository(repo_url)
        if self.is_repository_too_large(repository_payload.tokens):
            raise RepositoryTooLargeError(repository_payload.tokens, self.max_payload_tokens)

        extracted = await self.extract_skills(
            repository_payload.payload,
            skill_names=skill_names,
            task_description=task_description,
            task_requirements=task_requirements,
        )
        
        if not extracted.skills:
            return []
            
        return await self.match_skills(db, extracted.skills, self.DISTANCE_TRESHOLD)

analyzer = RepoAnalyzer()
