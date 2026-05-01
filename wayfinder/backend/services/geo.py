import math
from typing import List, Tuple

Point = Tuple[float, float]

TYPE_FACTORS = {
    "walk": 1.0,
    "stairs": 2.0,      
    "elevator": 1.5,    
    "escalator": 1.0,   
    "restricted": 999.0 
}

def polyline_length(poly: List[List[float]]) -> float:
    if not poly or len(poly) < 2:
        return 0.0
    total = 0.0
    for i in range(1, len(poly)):
        x1, y1 = poly[i - 1]
        x2, y2 = poly[i]
        total += math.hypot(x2 - x1, y2 - y1)
    return total

def calculate_edge_weight(
    polyline: List[List[float]], 
    type: str, 
    map_scale: float
) -> float:
    factor = TYPE_FACTORS.get(type, 1.0)
    pixel_len = polyline_length(polyline) 
    return (pixel_len * map_scale) * factor