from rapidfuzz import fuzz

def calculate_score_new(query, name):
    norm_q = query.lower().strip()
    name_norm = name.lower().strip()
    
    # Base score using token_set_ratio
    score = fuzz.token_set_ratio(norm_q, name_norm)
    
    # Bonus for exact match
    if norm_q == name_norm:
        score += 30
    # Bonus for substring match
    elif norm_q in name_norm:
        score += 10
        
    # Tie-breaker: prefer shorter names
    tie_breaker = fuzz.ratio(norm_q, name_norm) * 0.1
    score += tie_breaker
    
    return score

q = "cong 1"
n1 = "cong 1"
n2 = "bai xe cong 1"

print(f"Query: '{q}'")
print(f"Score for '{n1}': {calculate_score_new(q, n1):.2f}")
print(f"Score for '{n2}': {calculate_score_new(q, n2):.2f}")
