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
    segments: list[str]
    kpi_order: dict[str, list[str]]
    composition_charts: list[KpiCompositionChartConfig] = []
