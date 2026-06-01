import re
from typing import Any, Literal

from pydantic import BaseModel, SecretStr, field_validator, model_validator

# Keywords that indicate a mutation query (first-pass filter only)
_MUTATION_KEYWORDS = re.compile(
    r"^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|COPY)\b",
    re.IGNORECASE,
)


class SSLMode(str):
    """Database SSL connection modes."""

    DISABLE = "disable"
    REQUIRE = "require"
    VERIFY_CA = "verify-ca"
    VERIFY_FULL = "verify-full"


# ---------------------------------------------------------------------------
# Connection request — Postgres + BigQuery discriminated union
# ---------------------------------------------------------------------------


class DatabaseConnectionRequest(BaseModel):
    """Request to connect to a database (Postgres or BigQuery)."""

    db_type: Literal["postgres", "bigquery"] = "postgres"

    # Postgres fields
    host: str | None = None
    port: int = 5432
    database: str | None = None
    username: str | None = None
    password: SecretStr | None = None
    ssl_mode: str = "require"

    # BigQuery fields
    project_id: str | None = None
    dataset: str | None = None
    location: str | None = "US"
    sa_client_email: str | None = None
    sa_private_key: SecretStr | None = None

    @model_validator(mode="after")
    def validate_by_db_type(self) -> "DatabaseConnectionRequest":
        """Enforce required fields per db_type."""
        if self.db_type == "postgres":
            if not self.host or not self.host.strip():
                raise ValueError("host is required for Postgres connections")
            if not self.database or not self.database.strip():
                raise ValueError("database is required for Postgres connections")
            if not self.username or not self.username.strip():
                raise ValueError("username is required for Postgres connections")
            if self.password is None:
                raise ValueError("password is required for Postgres connections")
        elif self.db_type == "bigquery":
            if not self.project_id or not self.project_id.strip():
                raise ValueError("project_id is required for BigQuery connections")
            if not self.dataset or not self.dataset.strip():
                raise ValueError("dataset is required for BigQuery connections")
        return self

    @field_validator("port")
    @classmethod
    def validate_port(cls, v: int) -> int:
        """Validate port is in the valid TCP range."""
        if v < 1 or v > 65535:
            raise ValueError("Port must be between 1 and 65535")
        return v


class ConnectResponse(BaseModel):
    """Response from a successful database connection."""

    success: bool
    handle: str  # UUID, server-stored with 15-min TTL
    message: str
    version: str | None = None


class TableIdentifier(BaseModel):
    """Identifier for a database table."""

    schema_name: str = "public"  # e.g., "public" for Postgres; dataset for BigQuery
    name: str  # e.g., "evaluations"

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate table name is non-empty."""
        if not v or not v.strip():
            raise ValueError("Table name cannot be empty")
        return v.strip()


class TableInfo(BaseModel):
    """Information about a database table."""

    schema_name: str
    name: str
    row_count_estimate: int


class TablesListResponse(BaseModel):
    """Response containing list of tables."""

    success: bool
    tables: list[TableInfo]


class ColumnInfo(BaseModel):
    """Information about a table column."""

    name: str
    data_type: str
    nullable: bool


class TableSchemaResponse(BaseModel):
    """Response containing table schema information."""

    success: bool
    columns: list[ColumnInfo]
    sample_values: dict[str, list[Any]]  # First 5 values per column


class ColumnMapping(BaseModel):
    """Mapping from source DB column to target AXIS column."""

    source: str  # DB column name
    target: str  # AXIS column name


class FilterCondition(BaseModel):
    """Simple equality filter condition."""

    column: str
    value: str  # Equality only for v1


class DatabaseImportRequest(BaseModel):
    """Request to import data from database."""

    handle: str
    table: TableIdentifier
    mappings: list[ColumnMapping] | None = None
    filters: list[FilterCondition] | None = None
    limit: int = 10000
    dedupe_on_id: bool = True

    @field_validator("limit")
    @classmethod
    def validate_limit(cls, v: int) -> int:
        """Validate limit is positive and within bounds."""
        if v < 1:
            raise ValueError("Limit must be at least 1")
        if v > 10000:
            raise ValueError("Limit cannot exceed 10000 rows")
        return v


class PreviewRequest(BaseModel):
    """Request to preview data from database."""

    table: TableIdentifier
    mappings: list[ColumnMapping] | None = None
    filters: list[FilterCondition] | None = None
    limit: int = 10


class PreviewResponse(BaseModel):
    """Response containing preview data."""

    success: bool
    data: list[dict[str, Any]]
    row_count: int


class DistinctValuesRequest(BaseModel):
    """Request to get distinct values for a column."""

    table: TableIdentifier
    column: str
    limit: int = 100


class DistinctValuesResponse(BaseModel):
    """Response containing distinct values."""

    success: bool
    values: list[str]


class DatabaseDefaults(BaseModel):
    """Default database connection values from config."""

    # Common
    db_type: str = "postgres"

    # Postgres connection (password is never sent — only a flag)
    url: str | None = None
    host: str | None = None
    port: int = 5432
    database: str | None = None
    username: str | None = None
    has_password: bool = False
    ssl_mode: str = "require"

    # BigQuery connection (sa_private_key is never sent — only a flag)
    project_id: str | None = None
    dataset: str | None = None
    location: str | None = None
    has_sa_credentials: bool = False

    # Default table to auto-select
    table: str | None = None

    # Whether any defaults are configured
    has_defaults: bool = False

    # Wizard config (from YAML)
    tables: list[str] = []
    filters: list[dict[str, str]] = []
    column_rename_map: dict[str, str] = {}
    query: str | None = None
    query_timeout: int = 60
    row_limit: int = 10000


def _validate_sql_query(query: str) -> str:
    """Validate a SQL query for safety.

    Strips trailing semicolons, rejects multi-statement queries,
    and rejects known mutation keywords.
    """
    cleaned = query.rstrip().rstrip(";").strip()
    if not cleaned:
        raise ValueError("Query cannot be empty")
    if ";" in cleaned:
        raise ValueError("Multi-statement queries are not allowed (no semicolons)")
    if _MUTATION_KEYWORDS.match(cleaned):
        raise ValueError(
            "Only SELECT queries are allowed. "
            "INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, and COPY are forbidden."
        )
    return cleaned


class QueryPreviewRequest(BaseModel):
    """Request to preview results of a SQL query."""

    query: str
    limit: int = 10

    @field_validator("query")
    @classmethod
    def validate_query(cls, v: str) -> str:
        """Validate and sanitize the SQL query."""
        return _validate_sql_query(v)

    @field_validator("limit")
    @classmethod
    def validate_limit(cls, v: int) -> int:
        """Validate limit is positive and within bounds."""
        if v < 1:
            raise ValueError("Limit must be at least 1")
        if v > 100:
            raise ValueError("Preview limit cannot exceed 100 rows")
        return v


class QueryImportRequest(BaseModel):
    """Request to import data from a SQL query."""

    handle: str
    query: str
    limit: int = 10000
    dedupe_on_id: bool = True

    @field_validator("query")
    @classmethod
    def validate_query(cls, v: str) -> str:
        """Validate and sanitize the SQL query."""
        return _validate_sql_query(v)

    @field_validator("limit")
    @classmethod
    def validate_limit(cls, v: int) -> int:
        """Validate limit is positive and within bounds."""
        if v < 1:
            raise ValueError("Limit must be at least 1")
        if v > 50000:
            raise ValueError("Import limit cannot exceed 50000 rows")
        return v
