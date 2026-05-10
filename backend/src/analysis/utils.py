from pathlib import Path
from typing import List

import yaml

from openai import AsyncOpenAI

from ..config import global_config

CONFIG_PATH = Path(__file__).parent / "config.yaml"

with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    analysis_config = yaml.safe_load(f)

client = AsyncOpenAI(
    base_url=analysis_config["base_url"],
    api_key=global_config.OPENROUTER_API_KEY,
)

async def get_embedding(text: str) -> List[float]:
    model_name = analysis_config["models"]["embedding"]["name"]
    response = await client.embeddings.create(
        model=model_name,
        input=[{"content": [{"type": "text", "text": text}]}],
        encoding_format="float",
        dimensions=384
    )
    return response.data[0].embedding

async def get_completion(prompt: str, payload: str, model: str = None, temperature: float = None) -> str:
    if model is None:
        model = analysis_config["models"]["llm"]["name"]
    if temperature is None:
        temperature = analysis_config["models"]["llm"]["temperature"]
        
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": payload}
        ],
        temperature=temperature,
    )
    return response.choices[0].message.content
