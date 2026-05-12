from datetime import datetime, timezone
from typing import List
import math
from scipy.stats import norm
from ..config import global_config

def calculate_adjusted_score(raw_score: int, last_seen_date: datetime) -> int:
    """
    Вычисляет оценку навыка с учетом временного штрафа
    """
    if not last_seen_date:
        return raw_score
        
    now = datetime.now(timezone.utc)
    delta_days = (now - last_seen_date).days
    n = max(0, delta_days // global_config.SKILL_SCORE_DECAY_INTERVAL)
    decay_factor = max(1.0 - global_config.SKILL_SCORE_DECAY_FACTOR * n, 0.2)
    
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

def get_level_index_normal(score: float, num_levels: int) -> int:
    """
    Распределяет оценку [0, 100] по уровням с использованием нормального распределения.
    Центральные уровни имеют бОльшие промежутки, крайние - меньшие.
    """
    if num_levels <= 0:
        return 0
    if num_levels == 1:
        return 0
        
    # Среднее и стандартное отклонение (оценка 0-100)
    # По правилу 3 сигм: 99.7% значений лежат в пределах 3 сигм.
    # Если mu = 50 и 3*sigma = 50, то sigma = 50/3
    mu = 50.0
    sigma = 50.0 / 3.0
    
    # Делим диапазон нормального распределения на num_levels интервалов
    # по перцентилям, чтобы площади (вероятности) под кривой были равны
    # В данном случае "ненормальность" интервалов от 0 до 100 достигается тем,
    # что мы находим CDF для заданного балла, а затем распределяем CDF 
    # равномерно по уровням.
    p = norm.cdf(score, loc=mu, scale=sigma)
    
    index = math.floor(p * num_levels)
    if index >= num_levels:
        index = num_levels - 1
        
    return index
