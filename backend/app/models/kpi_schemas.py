from pydantic import BaseModel


class KpiTrendPoint(BaseModel):
    """A single data point in a KPI trend time series."""

    date: str  # UTC day bucket
    kpi_name: str
    value: float | None  # daily avg of numeric_value
    avg_7d: float | None
    avg_30d: float | None
    count: int  # rows that day (data coverage)


class KpiTrendsResponse(BaseModel):
    """Response for /api/kpi/trends."""

    success: bool = True
    data: list[KpiTrendPoint]
    kpi_names: list[str]
    trend_lines: list[str] = ["daily", "avg_7d", "avg_30d"]


class KpiSparklinePoint(BaseModel):
    """A single data point in a KPI sparkline."""

    date: str
    value: float | None


class KpiCategoryItem(BaseModel):
    """A single KPI within a category panel."""

    kpi_name: str
    display_name: str
    current_value: float | None
    card_display_value: str = "latest"  # "latest" | "avg_7d" | "avg_30d"
    trend_direction: str | None  # "up" | "down" | "flat" (raw direction)
    polarity: str  # "higher_better" | "lower_better"
    sparkline: list[KpiSparklinePoint]
    unit: str
    record_count: int  # total records for this KPI


class KpiCategoryPanel(BaseModel):
    """A category panel grouping related KPIs."""

    category: str
    display_name: str
    icon: str
    kpis: list[KpiCategoryItem]


class KpiDateRange(BaseModel):
    """Date range for KPI data."""

    min_date: str
    max_date: str


class KpiCategoriesResponse(BaseModel):
    """Response for /api/kpi/categories."""

    success: bool = True
    categories: list[KpiCategoryPanel]
    date_range: KpiDateRange | None = None


class KpiCompositionKpiEntry(BaseModel):
    """A single KPI reference within a composition chart."""

    kpi_name: str
    label: str
    color: str


class KpiCompositionChartConfig(BaseModel):
    """Configuration for a stacked composition chart built from KPI values."""

    title: str
    kpis: list[KpiCompositionKpiEntry]
    show_remainder: bool = False
    remainder_label: str = "Other"
    remainder_color: str = "#6B7280"


class KpiFiltersResponse(BaseModel):
    """Response for /api/kpi/filters."""

    success: bool = True
    source_names: list[str]
    environments: list[str]
    kpi_categories: list[str]
    kpi_names: list[str]
    source_types: list[str]
    source_components: list[str] = []
    segments: list[str]
    kpi_order: dict[str, list[str]]
    composition_charts: list[KpiCompositionChartConfig] = []
    has_sankey_charts: bool = False
    card_hidden_kpi_names: list[str] = []
    production_kpi_names: list[str] = []


class KpiPercentiles(BaseModel):
    """Percentile values for a KPI distribution."""

    p25: float
    p50: float
    p75: float
    p95: float


class KpiDistributionResponse(BaseModel):
    """Response for GET /api/kpi/distribution."""

    success: bool = True
    kpi_name: str
    unit: str
    bin_edges: list[float]
    bin_counts: list[int]
    total: int
    sample_size: int
    capped: bool
    percentiles: KpiPercentiles | None = None
    is_binary: bool = False  # True when all values are 0 or 1
    binary_counts: dict[str, int] | None = None  # {"0": N, "1": M} when is_binary


class KpiSegmentBar(BaseModel):
    """A single segment bar in a segment comparison chart."""

    segment: str
    agg_value: float
    # Rows aggregated for this segment. Under "weighted" aggregation this is the
    # number of contributing join-key pairs, not the summed weight.
    count: int
    # Join keys that matched more than one weight or value row. Non-zero means the
    # pivot picked one arbitrarily, so agg_value for that segment is unreliable.
    conflict_pairs: int = 0


class KpiSegmentComparisonResponse(BaseModel):
    """Response for GET /api/kpi/segment-comparison."""

    success: bool = True
    kpi_name: str
    unit: str
    aggregation: str  # "avg", "sum", or "weighted"
    segment_visual_order: str = "highest_top"  # "highest_top" or "lowest_top"
    segments: list[KpiSegmentBar]


class KpiDrillDownRow(BaseModel):
    """A single case-level KPI row for drill-down."""

    dataset_id: str
    created_at: str
    numeric_value: float | None
    segment: str | None = None
    source_component: str | None = None
    source_step: str | None = None
    environment: str | None = None


class KpiDrillDownResponse(BaseModel):
    """Paginated response for GET /api/kpi/drill-down."""

    success: bool = True
    data: list[KpiDrillDownRow]
    total: int
    page: int
    page_size: int
    kpi_name: str


class KpiCaseKpiValue(BaseModel):
    """A single KPI value within a case profile."""

    kpi_name: str
    display_name: str
    kpi_category: str | None = None
    numeric_value: float | None = None
    unit: str = "score"


class KpiCaseProfileResponse(BaseModel):
    """Response for GET /api/kpi/case-profile."""

    success: bool = True
    dataset_id: str
    created_at: str | None = None
    segment: str | None = None
    source_component: str | None = None
    environment: str | None = None
    kpis: list[KpiCaseKpiValue]


class KpiSankeyNode(BaseModel):
    """A node in the Sankey diagram."""

    label: str
    color: str


class KpiSankeyLink(BaseModel):
    """A link between two nodes."""

    source: int
    target: int
    value: float
    color: str


class KpiSankeySummaryKpi(BaseModel):
    """A summary KPI card displayed above the Sankey."""

    label: str
    value: float | str
    unit: str
    color: str | None = None


class KpiSankeyChartData(BaseModel):
    """Assembled data for a single Sankey chart."""

    title: str
    nodes: list[KpiSankeyNode]
    links: list[KpiSankeyLink]
    summary_kpis: list[KpiSankeySummaryKpi]
    column_labels: list[str]


class KpiSankeyResponse(BaseModel):
    """Response for GET /api/kpi/sankey."""

    success: bool = True
    charts: list[KpiSankeyChartData]
