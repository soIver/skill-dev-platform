from datetime import datetime, timezone
import math
from scipy.stats import norm
from ..config import global_config


def calculate_vtotal(
    relations: list[tuple[int, float]],
    source_scores: dict[int, float],
    epsilon: float = 0.1,
) -> float:
    """
    Взвешенное среднее геометрическое для корректировки оценки по связям навыков.
    relations — список (source_id, weight), где source влияет на target.
    source_scores — средние оценки источников (0–100) из репозиториев пользователя.
    """
    if not relations:
        return 1.0

    sum_w = 0.0
    sum_wln = 0.0
    for source_id, weight in relations:
        # пропускаем источник, если он не найден в репозиториях пользователя
        if source_id not in source_scores:
            continue
        vi = source_scores[source_id] / 100.0
        vi = max(vi, epsilon)
        sum_w += weight
        sum_wln += weight * math.log(vi)

    # нет ни одного найденного источника — коррекция не применяется
    if sum_w == 0:
        return 1.0

    return math.exp(sum_wln / sum_w)

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

def get_level_score_bounds(level_index: int, num_levels: int) -> tuple[float, float]:
    """
    Вычисляет границы баллов для уровня по той же шкале, что и get_level_index_normal
    """
    if num_levels <= 0:
        return (0.0, 100.0)

    if num_levels == 1:
        return (0.0, 100.0)

    clamped_index = min(max(level_index, 0), num_levels - 1)
    mu = 50.0
    sigma = 50.0 / 3.0

    lower_probability = clamped_index / num_levels
    upper_probability = (clamped_index + 1) / num_levels

    lower_bound = 0.0 if lower_probability <= 0 else norm.ppf(lower_probability, loc=mu, scale=sigma)
    upper_bound = 100.0 if upper_probability >= 1 else norm.ppf(upper_probability, loc=mu, scale=sigma)

    return (
        min(100.0, max(0.0, lower_bound)),
        min(100.0, max(0.0, upper_bound)),
    )

def calculate_confidence(score: float, total_levels: int, level_index: int) -> float:
    """
    Вычисляет показатель уверенности в уровне навыка
    """
    if total_levels <= 0:
        return 0.0

    lower_bound, upper_bound = get_level_score_bounds(level_index, total_levels)
    if upper_bound <= lower_bound:
        return 1.0

    midpoint = (lower_bound + upper_bound) / 2
    half_width = (upper_bound - lower_bound) / 2
    confidence = 1.0 - abs(score - midpoint) / half_width

    return min(1.0, max(0.0, confidence))

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
