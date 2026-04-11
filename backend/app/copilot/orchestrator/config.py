"""Orchestrator configuration: models, limits, budgets, sandbox policy."""

from __future__ import annotations

# ── Model ──

ORCHESTRATOR_MODEL = "gpt-5.2-codex"
PYTHON_AGENT_MODEL = "gpt-5.2-codex"
REPORTING_AGENT_MODEL = "gpt-5.2-codex"
RESEARCH_AGENT_MODEL = "gpt-5.2-codex"

# ── Control Plane Limits ──

MAX_DELEGATION_HOPS = 8
MAX_TOOL_CALLS_PER_REQUEST = 25
MAX_WALL_CLOCK_S = 120
MAX_TOKEN_BUDGET = 200_000
MAX_OUTPUT_SIZE_BYTES = 50 * 1024  # 50KB per tool output
MAX_WORKSPACE_DISK_BYTES = 100 * 1024 * 1024  # 100MB
TOKEN_BUDGET_WARNING_PCT = 0.80  # warn at 80%

# ── Circuit Breaker ──

CIRCUIT_BREAKER_THRESHOLD = 3  # consecutive failures to open
CIRCUIT_BREAKER_RESET_S = 60  # seconds before half-open
CIRCUIT_BREAKER_WINDOW_S = 300  # error counter reset window

# ── Python Sandbox ──

PYTHON_TIMEOUT_S = 60
PYTHON_MEMORY_LIMIT_MB = 512
PYTHON_MAX_OUTPUT_BYTES = 50 * 1024  # 50KB stdout/stderr cap
PYTHON_MAX_FILE_BYTES = 10 * 1024 * 1024  # 10MB per generated file

# Pre-baked packages (installed at workspace creation, pinned versions)
PYTHON_PREINSTALLED = [
    "pandas",
    "numpy",
    "scipy",
    "scikit-learn",
    "statsmodels",
    "plotly",
    "seaborn",
    "matplotlib",
]

# Runtime install allowlist (disabled in prod by default)
PYTHON_INSTALL_ALLOWLIST = frozenset({
    "scipy",
    "scikit-learn",
    "statsmodels",
    "seaborn",
    "matplotlib",
    "plotly",
    "networkx",
    "textblob",
    "nltk",
    "xgboost",
    "lightgbm",
})

PYTHON_RUNTIME_INSTALL_ENABLED = True  # enable for dev; disable in prod Docker images

# ── Sandbox Backend ──

# "local" = UnixLocalSandboxClient (dev), "docker" = DockerSandboxClient (prod)
SANDBOX_BACKEND = "local"
DOCKER_PYTHON_IMAGE = "python:3.12-slim"

# ── Compaction ──

COMPACTION_THRESHOLD = 200_000

# ── SSE ──

SSE_HEARTBEAT_INTERVAL_S = 15

# ── Observability ──

DELEGATION_LOG_TASK_PREVIEW_CHARS = 100
