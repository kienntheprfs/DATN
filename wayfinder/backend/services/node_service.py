from typing import Optional, List, Dict, Any
from sqlmodel import Session, select
from sqlalchemy import or_, and_
from backend.models.entities import Node, Map, Alias, Edge
import json


class NodeService:
    """Service for handling node-related operations with optimized queries"""

    @staticmethod
    def get_map_complete_data(
        session: Session, map_id: int, floor: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Get complete map data including nodes, edges, and aliases in a single query
        to reduce multiple API calls from frontend
        """
        # Get map info
        map_obj = session.get(Map, map_id)
        if not map_obj:
            raise ValueError("Map không tồn tại")

        # Build base query for nodes
        nodes_query = select(Node).where(Node.map_id == map_id)
        if floor is not None:
            nodes_query = nodes_query.where(Node.floor == floor)
        nodes = session.exec(nodes_query).all()

        # Get all node IDs for batch queries
        node_ids = [node.id for node in nodes]
        
        # Get aliases for all nodes in batch
        aliases = []
        if node_ids:
            # Build OR conditions for each node_id
            alias_conditions = []
            for nid in node_ids:
                alias_conditions.append(Alias.node_id == nid)
            if alias_conditions:
                aliases_query = select(Alias).where(or_(*alias_conditions))
                aliases = session.exec(aliases_query).all()

        # Get edges for this map (and floor if specified)
        edges_query = select(Edge).where(Edge.map_id == map_id)
        if floor is not None:
            edges_query = edges_query.where(Edge.floor == floor)
        edges = session.exec(edges_query).all()

        # Organize aliases by node_id
        aliases_by_node = {}
        for alias in aliases:
            if alias.node_id not in aliases_by_node:
                aliases_by_node[alias.node_id] = []
            aliases_by_node[alias.node_id].append(
                {
                    "id": alias.id,
                    "name": alias.name,
                    "norm_name": alias.norm_name,
                    "lang": alias.lang,
                    "weight": alias.weight,
                    "generated": alias.generated,
                }
            )

        # Build response data
        nodes_data = []
        for node in nodes:
            node_data = {
                "id": node.id,
                "map_id": node.map_id,
                "x": node.x,
                "y": node.y,
                "is_landmark": node.is_landmark,
                "floor": node.floor,
                "meta": node.meta,
                "aliases": aliases_by_node.get(node.id, []),
            }
            nodes_data.append(node_data)

        # Process edges data
        edges_data = []
        for edge in edges:
            edge_data = {
                "id": edge.id,
                "map_id": edge.map_id,
                "start_node_id": edge.start_node_id,
                "end_node_id": edge.end_node_id,
                "floor": edge.floor,
                "polyline": edge.polyline,
                "weight": edge.weight,
                "bidirectional": edge.bidirectional,
                "meta": edge.meta,
            }
            edges_data.append(edge_data)

        return {
            "map": {
                "id": map_obj.id,
                "name": map_obj.name,
                "image_path": map_obj.image_path,
                "width": map_obj.width,
                "height": map_obj.height,
            },
            "nodes": nodes_data,
            "edges": edges_data,
            "floor": floor,
        }

    @staticmethod
    def get_nodes_with_aliases(
        session: Session, map_id: int, floor: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Get nodes with their aliases in a single query
        """
        nodes_query = select(Node).where(Node.map_id == map_id)
        if floor is not None:
            nodes_query = nodes_query.where(Node.floor == floor)
        nodes = session.exec(nodes_query).all()

        node_ids = [node.id for node in nodes]
        aliases = []
        if node_ids:
            # Build OR conditions for each node_id
            alias_conditions = []
            for nid in node_ids:
                alias_conditions.append(Alias.node_id == nid)
            if alias_conditions:
                aliases_query = select(Alias).where(or_(*alias_conditions))
                aliases = session.exec(aliases_query).all()

        aliases_by_node = {}
        for alias in aliases:
            if alias.node_id not in aliases_by_node:
                aliases_by_node[alias.node_id] = []
            aliases_by_node[alias.node_id].append(
                {
                    "id": alias.id,
                    "name": alias.name,
                    "norm_name": alias.norm_name,
                    "lang": alias.lang,
                    "weight": alias.weight,
                    "generated": alias.generated,
                }
            )

        result = []
        for node in nodes:
            node_data = {
                "id": node.id,
                "map_id": node.map_id,
                "x": node.x,
                "y": node.y,
                "is_landmark": node.is_landmark,
                "floor": node.floor,
                "meta": node.meta,
                "aliases": aliases_by_node.get(node.id, []),
            }
            result.append(node_data)

        return result

    @staticmethod
    def search_nodes_by_alias(
        session: Session, map_id: int, search_term: str, floor: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Search nodes by alias names with optimized query
        """
        # Normalize search term
        norm_search = search_term.lower().replace(" ", "")

        # First get node IDs from the specified map (and floor if provided)
        nodes_query = select(Node.id).where(Node.map_id == map_id)
        if floor is not None:
            nodes_query = nodes_query.where(Node.floor == floor)
        map_node_ids = session.exec(nodes_query).all()

        if not map_node_ids:
            return []

        # Build query for aliases matching the search term
        aliases_query = select(Alias).where(
            and_(Alias.node_id.in_(map_node_ids), Alias.norm_name.contains(norm_search))
        )

        aliases = session.exec(aliases_query).all()

        if not aliases:
            return []

        # Get unique node IDs
        node_ids = list(set([alias.node_id for alias in aliases]))

        # Get nodes data
        nodes_query = select(Node).where(Node.id.in_(node_ids))
        if floor is not None:
            nodes_query = nodes_query.where(Node.floor == floor)
        nodes = session.exec(nodes_query).all()

        # Build result with matching aliases
        result = []
        for node in nodes:
            node_aliases = [a for a in aliases if a.node_id == node.id]
            node_data = {
                "id": node.id,
                "map_id": node.map_id,
                "x": node.x,
                "y": node.y,
                "is_landmark": node.is_landmark,
                "floor": node.floor,
                "meta": node.meta,
                "matching_aliases": [
                    {
                        "id": a.id,
                        "name": a.name,
                        "norm_name": a.norm_name,
                        "lang": a.lang,
                        "weight": a.weight,
                    }
                    for a in node_aliases
                ],
            }
            result.append(node_data)

        return result
