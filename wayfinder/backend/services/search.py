from typing import List, Optional, Tuple, Dict
from sqlmodel import Session, select
from rapidfuzz import fuzz
from backend.models.entities import Alias, Node, Map, Building
from backend.services.nlp import normalize_name

class SearchResult:
    def __init__(self, node: Node, alias_id: int, name: str, score: float):
        self.node = node
        self.alias_id = alias_id
        self.name = name
        self.score = score

def find_best_nodes(
    session: Session,
    query: str,
    limit: int = 10
) -> List[SearchResult]:
    """
    Shared search logic for both routes and aliases routers.
    Searches both Node names and Aliases with improved scoring.
    """
    if not query or not query.strip():
        return []

    norm_q = normalize_name(query)
    query_words = [w for w in norm_q.split() if w]
    
    if not query_words:
        return []

    # 1. Fetch data
    all_maps = session.exec(select(Map)).all()
    all_buildings = session.exec(select(Building)).all()
    building_dict = {b.id: b.name for b in all_buildings}
    map_info = {
        m.id: {
            "building_id": m.building_id,
            "building_name": building_dict.get(m.building_id) if m.building_id else ""
        }
        for m in all_maps
    }

    all_nodes = session.exec(select(Node)).all()
    all_aliases = session.exec(select(Alias)).all()

    # 2. Map nodes to their names (Node.name + all its Aliases)
    node_names_map = {}
    for n in all_nodes:
        # Skip internal nodes
        if n.name and n.name.lower() == "new node":
            names = []
        elif n.name:
            names = [n.name]
        else:
            names = []
        node_names_map[n.id] = names

    # alias_info maps (node_id, name) -> alias_id
    alias_id_map = {}
    for a in all_aliases:
        if a.node_id in node_names_map:
            node_names_map[a.node_id].append(a.name)
            alias_id_map[(a.node_id, a.name)] = a.id

    # 3. Score each node
    results = []
    for n in all_nodes:
        names = node_names_map.get(n.id, [])
        if not names:
            continue

        m_info = map_info.get(n.map_id, {})
        building_name = m_info.get("building_name", "")
        building_lower = normalize_name(building_name)

        best_score = 0.0
        best_name = names[0]
        
        for name in names:
            name_norm = normalize_name(name)
            combined_name = f"{name_norm} {building_lower}".strip()

            # Base score using token_set_ratio (0-100)
            base_score = fuzz.token_set_ratio(norm_q, name_norm)
            combined_base_score = fuzz.token_set_ratio(norm_q, combined_name)
            
            # Start with the best base score, but capped at 90 for non-exact matches
            if norm_q == name_norm or norm_q == combined_name:
                current_score = 100.0
            else:
                current_score = max(base_score, combined_base_score) * 0.85 # Max 85.0
                
                # Bonus for substring match (up to +10)
                if norm_q in name_norm or norm_q in combined_name:
                    current_score += 10 # Max 95.0
            
            # Tie-breaker: prefer shorter names and better character-level match
            # This can push the score slightly above 100 or 95, which is fine for sorting
            # but we'll ensure the gap is maintained.
            tie_breaker = fuzz.ratio(norm_q, name_norm) * 0.05 # Max 5.0
            current_score += tie_breaker

            if current_score > best_score:
                best_score = current_score
                best_name = name

        # Filter out low quality results
        if best_score > 50:
            results.append(SearchResult(
                node=n,
                alias_id=alias_id_map.get((n.id, best_name), 0),
                name=best_name,
                score=best_score
            ))

    # Sort and return
    results.sort(key=lambda x: x.score, reverse=True)
    return results[:limit]
