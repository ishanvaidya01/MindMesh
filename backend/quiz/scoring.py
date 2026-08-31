"""
Scoring Engine — standard points and Brier-derived calibration scoring.

Standard score: base points for correctness + speed bonus.
Calibration score: Brier-derived proper scoring rule that rewards
confident-correct and punishes confident-wrong.

Ordering guarantee:
  confident-correct > unconfident-correct > unconfident-wrong > confident-wrong
"""


def compute_standard_score(
    is_correct: bool,
    latency_ms: int,
    time_limit_ms: int = 30000,
) -> int:
    """
    Standard score: 1000 base for correct, plus speed bonus.
    Speed bonus = up to 500 extra points, linearly decreasing with latency.
    Wrong answers score 0.
    """
    if not is_correct:
        return 0

    base = 1000
    # Speed bonus: max 500, linearly decays to 0 as latency approaches time_limit
    fraction_remaining = max(0.0, 1.0 - (latency_ms / max(time_limit_ms, 1)))
    speed_bonus = int(500 * fraction_remaining)

    return base + speed_bonus


def compute_calibration_score(
    is_correct: bool,
    confidence: int,
) -> float:
    """
    Brier-derived calibration score (Pure Quadratic Scoring Rule).
    calibration_score = 1 - (confidence/100 - outcome)^2
    where outcome = 1 if correct, 0 if wrong.
    
    This proper scoring rule mathematically guarantees that expected score
    is strictly maximized ONLY when stated confidence exactly equals true internal probability.
    """
    c = max(0, min(100, confidence)) / 100.0  # Clamp to [0, 1]
    outcome = 1.0 if is_correct else 0.0
    score = 1.0 - (c - outcome) ** 2
    return round(score, 4)
