import math
from typing import List, Tuple

Point = Tuple[float, float]

def polyline_length(poly: List[Point]) -> float:
    if not poly or len(poly) < 2:
        return 0.0
    total = 0.0
    for i in range(1, len(poly)):
        x1, y1 = poly[i - 1]
        x2, y2 = poly[i]
        total += math.hypot(x2 - x1, y2 - y1)
    return total