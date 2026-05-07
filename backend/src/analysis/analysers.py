from typing import List, Tuple, Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from gitingest import ingest_async

from ..models import Skill
from ..utils.logger import get_logger
from .utils import get_embedding, get_completion, analysis_config

logger = get_logger("analysis.models")

class RepoAnalyzer:
    def __init__(self):
        self.config = analysis_config

    async def ingest_repository(self, url: str) -> str:
        logger.info(f"Ingesting repository {url}...")
        ignore_patterns = [
            "*.md", "*.txt", "package.json", "package-lock.json",
            "poetry.lock", "Pipfile*", "node_modules", ".env*",
            "__pycache__", "venv", ".venv", "dist", "build", "out"
        ]
        summary, tree, content = await ingest_async(url, exclude_patterns=ignore_patterns)
        return f"{tree}\n\n{content}"

    async def extract_skills(self, payload: str) -> List[Tuple[str, int]]:
        prompt = self.config["prompts"]["repository_analysis"]
        model = self.config["models"]["llm"]["name"]
        
        logger.debug(f"Отправка запроса модели {model}")
        content = await get_completion(prompt=prompt, payload=payload)
        if not content:
            return []

        skills = []
        for line in content.split("\n"):
            line = line.strip()
            if not line:
                continue
            
            parts = line.split(":")
            if len(parts) == 2:
                name = parts[0].strip()
                try:
                    score = int(parts[1].strip())
                    if 0 <= score <= 100:
                        skills.append((name, score))
                except ValueError:
                    pass
        
        logger.debug(f"Извлечено {len(skills)} навыков")
        return skills

    async def match_skills(self, db: AsyncSession, extracted_skills: List[Tuple[str, int]], threshold: float = 0.2) -> List[Dict]:
        matched = []
        for skill_name, score in extracted_skills:
            vector = await get_embedding(skill_name)
            
            # Using pgvector <-> operator for cosine distance.
            # We want to find the closest skill in DB.
            # distance = cosine_distance = 1 - cosine_similarity
            query = select(Skill).order_by(Skill.embedding.cosine_distance(vector)).limit(1)
            result = await db.execute(query)
            closest_skill = result.scalar_one_or_none()

            if closest_skill and closest_skill.embedding is not None:
                # We need to also fetch the actual distance to check against threshold
                dist_query = select(Skill.embedding.cosine_distance(vector)).where(Skill.id == closest_skill.id)
                dist_result = await db.execute(dist_query)
                dist = dist_result.scalar_one_or_none()
                
                if dist is not None and dist <= threshold:
                    logger.debug(f"Matched '{skill_name}' to '{closest_skill.name}' (dist: {dist:.3f})")
                    matched.append({
                        "skill_id": closest_skill.id,
                        "score": score
                    })
                else:
                    logger.debug(f"Discarded '{skill_name}' (closest: '{closest_skill.name}', dist: {dist:.3f} > {threshold})")
            else:
                 logger.debug(f"Discarded '{skill_name}' (no skills with embeddings in DB)")

        return matched

    async def analyze(self, repo_url: str, db: AsyncSession) -> List[Dict]:
        payload = await self.ingest_repository(repo_url)
        extracted = await self.extract_skills(payload)
        
        if not extracted:
            return []
            
        return await self.match_skills(db, extracted)

analyzer = RepoAnalyzer()
