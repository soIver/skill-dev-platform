from datetime import datetime, timezone
from typing import List
from ..config import global_config

def calculate_adjusted_score(raw_score: int, last_seen_date: datetime) -> int:
    """
    Вычисляет оценку навыка с учетом временного штрафа
    """
    if not last_seen_date:
        return raw_score
        
    now = datetime.now(timezone.utc)
    delta_days = (now - last_seen_date).days
    n = max(0, delta_days // global_config.DECAY_INTERVAL)
    decay_factor = max(1.0 - global_config.DECAY_FACTOR * n, 0.2)
    
    return int(raw_score * decay_factor)

def calculate_confidence(scores: List[int], total_levels: int, next_level_order: int) -> float:
    """
    Вычисляет показатель уверенности в уровне навыка
    """
    if not scores:
        return 0.0
        
    avg_score = sum(scores) / len(scores)
    
    if total_levels == 0:
        return 0.0
        
    threshold = (100.0 / total_levels) * next_level_order
    
    if threshold == 0:
        return 1.0
        
    return min(1.0, avg_score / threshold)
