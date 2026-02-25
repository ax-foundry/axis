import logging
import re
from typing import Any

from falkordb import FalkorDB, Graph

from app.config import settings
from app.plugins.memory.models.graph_schemas import (
    GraphData,
    GraphEdge,
    GraphNode,
    GraphSearchResult,
)

logger = logging.getLogger(__name__)

# Module-level cached connection
_db: FalkorDB | None = None
_graph: Graph | None = None


def _get_graph() -> Graph:
    """Get or create a cached FalkorDB graph connection."""
    global _db, _graph
    if _graph is not None:
        return _graph

    host = settings.graph_db_host
    port = settings.graph_db_port
    graph_name = settings.graph_db_name
    password = settings.graph_db_password

    logger.info("Connecting to FalkorDB at %s:%s, graph=%s", host, port, graph_name)
    _db = FalkorDB(host=host, port=port, password=password)
    _graph = _db.select_graph(graph_name)
    logger.info("Connected to FalkorDB graph: %s", graph_name)
    return _graph


def _reset_connection() -> None:
    """Reset cached connection (e.g. after error)."""
    global _db, _graph
    _db = None
    _graph = None


def _slugify(text: str) -> str:
    """Create a URL-safe slug from text."""
    return re.sub(r"[^a-z0-9_]", "_", text.lower().strip())


def _node_to_graph_node(node: object, label: str) -> GraphNode:
    """Convert a FalkorDB result node to our GraphNode model."""
    props = node.properties if hasattr(node, "properties") else {}
    name = props.get("name", str(props.get("id", "unknown")))
    node_id = f"{label}:{_slugify(name)}"

    # Build metadata from all properties except name
    metadata = {}
    for k, v in props.items():
        if k != "name" and v is not None:
            metadata[k] = str(v)

    return GraphNode(
        id=node_id,
        label=name,
        type=label,
        metadata=metadata,
    )


def _edge_to_graph_edge(rel: object, source_id: str, target_id: str) -> GraphEdge:
    """Convert a FalkorDB relationship to our GraphEdge model."""
    rel_type = rel.relation if hasattr(rel, "relation") else "RELATED"
    props = rel.properties if hasattr(rel, "properties") else {}
    edge_label = props.get("label", "")

    return GraphEdge(
        source=source_id,
        target=target_id,
        type=rel_type,
        label=edge_label,
    )


def _extract_label(node: object) -> str:
    """Extract the node label from a FalkorDB node."""
    if hasattr(node, "labels") and node.labels:
        return str(node.labels[0])
    return "Unknown"


def check_connection() -> dict[str, Any]:
    """Check if FalkorDB is reachable."""
    try:
        graph = _get_graph()
        # Simple query to verify connectivity
        graph.query("RETURN 1")
        return {
            "connected": True,
            "graph_name": settings.graph_db_name,
            "message": "Connected to FalkorDB",
        }
    except Exception as e:
        _reset_connection()
        logger.warning("FalkorDB connection check failed: %s", e)
        return {
            "connected": False,
            "graph_name": settings.graph_db_name,
            "message": f"Connection failed: {e}",
        }


def get_summary() -> dict[str, Any]:
    """Get summary statistics for the knowledge graph."""
    graph = _get_graph()

    # Count nodes by label
    result = graph.query("MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt")
    nodes_by_type: dict[str, int] = {}
    total_nodes = 0
    for row in result.result_set:
        label = row[0] or "Unknown"
        count = row[1]
        nodes_by_type[label] = count
        total_nodes += count

    # Count edges by relation type
    result = graph.query("MATCH ()-[r]->() RETURN type(r) AS rel, count(r) AS cnt")
    edges_by_relation: dict[str, int] = {}
    total_edges = 0
    for row in result.result_set:
        rel = row[0]
        count = row[1]
        edges_by_relation[rel] = count
        total_edges += count

    # Rules by action
    rules_by_action: dict[str, int] = {}
    try:
        result = graph.query("MATCH (r:Rule) RETURN r.action AS action, count(r) AS cnt")
        for row in result.result_set:
            if row[0]:
                rules_by_action[row[0]] = row[1]
    except Exception:
        logger.debug("No action property on Rule nodes")

    # Rules by product
    rules_by_product: dict[str, int] = {}
    try:
        result = graph.query("MATCH (r:Rule) RETURN r.product_type AS product, count(r) AS cnt")
        for row in result.result_set:
            if row[0]:
                rules_by_product[row[0]] = row[1]
    except Exception:
        logger.debug("No product_type property on Rule nodes")

    return {
        "total_nodes": total_nodes,
        "total_edges": total_edges,
        "nodes_by_type": nodes_by_type,
        "edges_by_relation": edges_by_relation,
        "rules_by_action": rules_by_action,
        "rules_by_product": rules_by_product,
    }


def get_full_graph(
    limit: int = 500,
    risk_factor: str | None = None,
    product_type: str | None = None,
    action: str | None = None,
    node_type: str | None = None,
) -> GraphData:
    """Fetch the full graph (or a filtered subset).

    Parameters
    ----------
    limit : int
        Maximum number of relationships to return.
    risk_factor : str | None
        Filter to show only subgraph connected to this risk factor.
    product_type : str | None
        Filter rules by product_type property.
    action : str | None
        Filter rules by action property.
    node_type : str | None
        Filter to only show nodes of this type.
    """
    graph = _get_graph()

    # Build the Cypher query based on filters
    where_clauses: list[str] = []
    params: dict[str, Any] = {}

    if risk_factor:
        # Match subgraph connected to the given risk factor
        query = "MATCH (rf:RiskFactor {name: $rf})-[r]-(m) " "RETURN rf, r, m LIMIT $limit"
        params = {"rf": risk_factor, "limit": limit}
    elif action or product_type or node_type:
        # Filter based on properties
        match_clause = "MATCH (n)-[r]->(m)"

        if action:
            where_clauses.append(
                "(n:Rule AND n.action = $action) OR (m:Rule AND m.action = $action)"
            )
            params["action"] = action
        if product_type:
            where_clauses.append(
                "(n:Rule AND n.product_type = $product) OR "
                "(m:Rule AND m.product_type = $product)"
            )
            params["product"] = product_type
        if node_type:
            where_clauses.append(f"(n:{node_type} OR m:{node_type})")

        where_str = " AND ".join(f"({c})" for c in where_clauses)
        query = f"{match_clause} WHERE {where_str} RETURN n, r, m LIMIT $limit"
        params["limit"] = limit
    else:
        query = "MATCH (n)-[r]->(m) RETURN n, r, m LIMIT $limit"
        params = {"limit": limit}

    result = graph.query(query, params)

    # Deduplicate nodes and edges
    nodes_map: dict[str, GraphNode] = {}
    edges_list: list[GraphEdge] = []
    seen_edges: set[str] = set()

    for row in result.result_set:
        n_node = row[0]
        rel = row[1]
        m_node = row[2]

        n_label = _extract_label(n_node)
        m_label = _extract_label(m_node)

        n_gn = _node_to_graph_node(n_node, n_label)
        m_gn = _node_to_graph_node(m_node, m_label)

        nodes_map[n_gn.id] = n_gn
        nodes_map[m_gn.id] = m_gn

        edge_key = f"{n_gn.id}->{m_gn.id}:{rel.relation if hasattr(rel, 'relation') else 'RELATED'}"
        if edge_key not in seen_edges:
            seen_edges.add(edge_key)
            edges_list.append(_edge_to_graph_edge(rel, n_gn.id, m_gn.id))

    nodes = list(nodes_map.values())

    # Compute counts
    node_counts: dict[str, int] = {}
    for node in nodes:
        node_counts[node.type] = node_counts.get(node.type, 0) + 1

    edge_counts: dict[str, int] = {}
    for edge in edges_list:
        edge_counts[edge.type] = edge_counts.get(edge.type, 0) + 1

    return GraphData(
        nodes=nodes,
        edges=edges_list,
        node_counts=node_counts,
        edge_counts=edge_counts,
    )


def search_nodes(query: str, limit: int = 20) -> list[GraphSearchResult]:
    """Search for nodes by name (case-insensitive contains)."""
    graph = _get_graph()

    q = query.lower()
    result = graph.query(
        "MATCH (n) "
        "WHERE toLower(n.name) CONTAINS $q "
        "OPTIONAL MATCH (n)-[r]-() "
        "RETURN n, labels(n)[0] AS label, count(r) AS connections "
        "ORDER BY connections DESC "
        "LIMIT $limit",
        {"q": q, "limit": limit},
    )

    results: list[GraphSearchResult] = []
    for row in result.result_set:
        node = row[0]
        label = row[1] or "Unknown"
        connections = row[2]
        props = node.properties if hasattr(node, "properties") else {}
        name = props.get("name", "unknown")

        # Build a snippet from properties
        snippet_parts = []
        for k, v in props.items():
            if k != "name" and v is not None:
                snippet_parts.append(f"{k}: {v}")
        snippet = "; ".join(snippet_parts[:3]) if snippet_parts else label

        results.append(
            GraphSearchResult(
                node_id=f"{label}:{_slugify(name)}",
                label=name,
                type=label,
                connected_nodes=connections,
                snippet=snippet,
            )
        )

    return results


def get_neighborhood(node_id: str, depth: int = 1) -> dict[str, Any]:
    """Get the neighborhood subgraph around a node.

    Parameters
    ----------
    node_id : str
        Node ID in format "Label:slug" (e.g. "Rule:high_risk_decline").
    depth : int
        How many hops from the focal node.
    """
    graph = _get_graph()

    # Parse node_id to get the label and name
    parts = node_id.split(":", 1)
    if len(parts) != 2:
        msg = f"Invalid node_id format: {node_id}. Expected 'Label:slug'."
        raise ValueError(msg)

    node_label = parts[0]
    node_slug = parts[1]

    # First find the focal node by matching slug against name
    focal_result = graph.query(
        f"MATCH (n:{node_label}) " "RETURN n " "LIMIT 50",
    )

    focal_node: GraphNode | None = None
    focal_name: str | None = None
    for row in focal_result.result_set:
        n = row[0]
        props = n.properties if hasattr(n, "properties") else {}
        name = props.get("name", "")
        if _slugify(name) == node_slug:
            focal_node = _node_to_graph_node(n, node_label)
            focal_name = name
            break

    if focal_node is None or focal_name is None:
        msg = f"Node not found: {node_id}"
        raise ValueError(msg)

    # Query the neighborhood
    depth_param = max(1, min(depth, 3))
    neighborhood_result = graph.query(
        f"MATCH (focal:{node_label} {{name: $name}})-[r*1..{depth_param}]-(neighbor) "
        "UNWIND r AS rel "
        "WITH focal, rel, startNode(rel) AS sn, endNode(rel) AS en "
        "RETURN focal, rel, sn, en",
        {"name": focal_name},
    )

    nodes_map: dict[str, GraphNode] = {focal_node.id: focal_node}
    edges_list: list[GraphEdge] = []
    seen_edges: set[str] = set()

    for row in neighborhood_result.result_set:
        rel = row[1]
        sn = row[2]
        en = row[3]

        sn_label = _extract_label(sn)
        en_label = _extract_label(en)

        sn_gn = _node_to_graph_node(sn, sn_label)
        en_gn = _node_to_graph_node(en, en_label)

        nodes_map[sn_gn.id] = sn_gn
        nodes_map[en_gn.id] = en_gn

        rel_type = rel.relation if hasattr(rel, "relation") else "RELATED"
        edge_key = f"{sn_gn.id}->{en_gn.id}:{rel_type}"
        if edge_key not in seen_edges:
            seen_edges.add(edge_key)
            edges_list.append(_edge_to_graph_edge(rel, sn_gn.id, en_gn.id))

    return {
        "focal_node": focal_node,
        "nodes": list(nodes_map.values()),
        "edges": edges_list,
        "depth": depth_param,
    }
