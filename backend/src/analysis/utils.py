from pathlib import Path
from typing import List

import yaml

from openai import AsyncOpenAI

from ..config import global_config
from ..utils.logger import get_logger

CONFIG_PATH = Path(__file__).parent / "config.yaml"
logger = get_logger("analysis.utils")

with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    analysis_config = yaml.safe_load(f)

client = AsyncOpenAI(
    base_url=analysis_config["base_url"],
    api_key=global_config.OPENROUTER_API_KEY,
)

async def get_embedding(text: str) -> List[float]:
    model_name = analysis_config["models"]["embedding"]["name"]
    dimensions_qnt = analysis_config["models"]["embedding"]["dimensions"]
    response = await client.embeddings.create(
        model=model_name,
        input=[{"content": [{"type": "text", "text": text}]}],
        encoding_format="float",
        dimensions=dimensions_qnt
    )
    if not response.data:
        logger.error(
            "OpenRouter embedding response without data: model=%s response=%s",
            model_name,
            response.model_dump(exclude_none=True) if hasattr(response, "model_dump") else response,
        )
        return []
    return response.data[0].embedding

async def get_completion(prompt: str, payload: str, model: str = None, temperature: float = None) -> str | None:
    if model is None:
        model = analysis_config["models"]["llm"]["name"]
    if temperature is None:
        temperature = analysis_config["models"]["llm"]["temperature"]
        
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": payload}
            ],
            temperature=temperature,
        )
    except Exception as exc:
        logger.exception("OpenRouter completion request failed: model=%s error=%s", model, exc)
        return None

    choices = getattr(response, "choices", None)
    if not choices:
        logger.error(
            "OpenRouter completion response without choices: model=%s response=%s",
            model,
            response.model_dump(exclude_none=True) if hasattr(response, "model_dump") else response,
        )
        return None

    message = choices[0].message
    content = getattr(message, "content", None)
    if not content:
        logger.error(
            "OpenRouter completion response without content: model=%s choice=%s",
            model,
            choices[0].model_dump(exclude_none=True) if hasattr(choices[0], "model_dump") else choices[0],
        )
        return None

    return content
