from dataclasses import dataclass
from enum import StrEnum


class DatabaseType(StrEnum):
    POSTGRES = "postgres"
    BIGQUERY = "bigquery"


@dataclass
class TableId:
    """Backend-internal table identifier.

    Postgres ignores ``project``; BigQuery uses it to build the fully-qualified
    table reference ``project.dataset.table``.
    """

    schema: str
    table: str
    project: str | None = None
