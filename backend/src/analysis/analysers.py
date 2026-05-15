import json
from typing import List, Tuple, Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from gitingest import ingest_async

from ..models import Skill
from ..utils.logger import get_logger
from .utils import get_embedding, get_completion, analysis_config

logger = get_logger("analysis.models")

class RepoAnalyzer:
    DISTANCE_TRESHOLD = 0.3

    def __init__(self):
        self.config = analysis_config

    async def ingest_repository(self, url: str) -> str:
        logger.info(f"Обработка репозитория {url}...")
        ignore_patterns = [
            "*.md", "*.txt", "package.json", "package-lock.json",
            "poetry.lock", "Pipfile*", "node_modules", ".env*",
            "__pycache__", "venv", ".venv", "dist", "build", "out"
        ]
        summary, tree, content = await ingest_async(url, exclude_patterns=ignore_patterns)
        return f"{tree}\n\n{content}"

    async def extract_skills(self, payload: str, skill_names: List[str] | None = None) -> List[Tuple[str, int]]:
        prompt = self.config["prompts"]["repository_analysis"]
        if skill_names:
            skills_str = ", ".join(skill_names)
            prompt += f"\n\nIMPORTANT: Evaluate the repository ONLY for the following skills: {skills_str}. Do not include any other skills in the output."

        model = self.config["models"]["llm"]["name"]
        
        logger.debug(f"Отправка запроса модели {model}")
        content = await get_completion(prompt=prompt, payload=payload)
        if not content:
            return []

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
            
            logger.debug(f"Извлечено {len(skills)} навыков")
            logger.debug(skills)
            return skills
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.error(f"Ошибка при парсинге JSON от LLM: {e}")
            logger.debug(f"Raw content: {content}")
            return []

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

    async def analyze(self, repo_url: str, db: AsyncSession, skill_names: List[str] | None = None) -> List[Dict]:
        payload = await self.ingest_repository(repo_url)
        extracted = await self.extract_skills(payload, skill_names=skill_names)
        
        if not extracted:
            return []
            
        return await self.match_skills(db, extracted, self.DISTANCE_TRESHOLD)

analyzer = RepoAnalyzer()
