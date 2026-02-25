from pydantic import BaseModel


class GraphNode(BaseModel):
    """A node in the knowledge graph."""

    id: str  # e.g. "RiskFactor:flood_zone" or "Rule:high_risk_decline"
    label: str  # Display name
    type: str  # RiskFactor | Rule | Outcome | Mitigant | Source
    metadata: dict[str, str] = {}


class GraphEdge(BaseModel):
    """An edge in the knowledge graph."""

    source: str  # Source node id
    target: str  # Target node id
    type: str  # TRIGGERS | RESULTS_IN | OVERRIDES | DERIVED_FROM
    label: str = ""


class GraphData(BaseModel):
    """Full graph payload with nodes and edges."""

    nodes: list[GraphNode]
    edges: list[GraphEdge]
    node_counts: dict[str, int]
    edge_counts: dict[str, int]


class GraphResponse(BaseModel):
    """API response wrapping graph data."""

    success: bool
    data: GraphData


class GraphSearchResult(BaseModel):
    """A single search result from the graph."""

    node_id: str
    label: str
    type: str
    connected_nodes: int
    snippet: str


class GraphSearchResponse(BaseModel):
    """API response for graph search."""

    success: bool
    results: list[GraphSearchResult]
    query: str
    total: int


class GraphNeighborhoodResponse(BaseModel):
    """API response for a node's neighborhood subgraph."""

    success: bool
    focal_node: GraphNode
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    depth: int


class GraphSummaryResponse(BaseModel):
    """API response for graph summary statistics."""

    success: bool
    total_nodes: int
    total_edges: int
    nodes_by_type: dict[str, int]
    edges_by_relation: dict[str, int]
    rules_by_action: dict[str, int]
    rules_by_product: dict[str, int]


class GraphStatusResponse(BaseModel):
    """API response for graph connection health check."""

    success: bool
    connected: bool
    graph_name: str
    message: str
