import re
from dataclasses import dataclass

MAX_INPUT_CHARS = 2_000  # Max user message length accepted

# DDL / DML keywords that must never reach DuckDB
SQL_UNSAFE_RE = re.compile(
    r"\b(DROP|INSERT|UPDATE|DELETE|CREATE|ALTER|TRUNCATE|REPLACE|MERGE|"
    r"GRANT|REVOKE|ATTACH|DETACH|COPY|EXPORT|IMPORT|INSTALL|LOAD)\b",
    re.IGNORECASE,
)

# Prompt-injection patterns in user input
INJECTION_RE = re.compile(
    r"ignore\s+(previous|above|all)\s+instructions|"
    r"forget\s+your\s+(previous|system)\s+prompt|"
    r"you\s+are\s+now\s+|pretend\s+you\s+are\s+|act\s+as\s+(?:if\s+)?you\s+are\s+|"
    r"disregard\s+.*instructions|override\s+.*system\s+prompt|"
    r"new\s+instructions\s*:|<\s*system\s*>",
    re.IGNORECASE,
)

# Patterns that should never appear in outbound responses
SENSITIVE_OUT_RE = re.compile(
    r"(password|api[_\-]?key|secret[_\-]?key|auth[_\-]?token)\s*[:=]\s*\S+|"
    r'File "[^"]+", line \d+|'  # Python traceback lines
    r"Traceback \(most recent call last\)",
    re.IGNORECASE,
)


@dataclass
class InputGuardrailResult:
    """Result of input sanitization."""

    message: str
    blocked_response: str | None = None


class RequestBlocked(Exception):
    """Raised when input fails guardrail checks."""

    def __init__(self, response: str) -> None:  # noqa: D107
        self.response = response
        super().__init__(response)


def check_sql_safety(sql: str) -> str | None:
    """Return an error message if *sql* contains disallowed statements, else None.

    Strips line comments and block comments before checking so that injected
    keywords buried inside comment text are also caught.
    """
    # Remove -- line comments
    cleaned = re.sub(r"--[^\n]*", " ", sql)
    # Remove /* block comments */
    cleaned = re.sub(r"/\*.*?\*/", " ", cleaned, flags=re.DOTALL)
    if SQL_UNSAFE_RE.search(cleaned):
        return "Only SELECT statements are permitted. Data-modification queries are blocked."
    return None


def sanitize_input(message: str) -> InputGuardrailResult:
    """Clean and validate a user message.

    Returns an ``InputGuardrailResult``.  When ``blocked_response`` is set the
    message was rejected by the guardrail and the caller should return that
    response to the user instead of proceeding.
    """
    # Strip null bytes
    message = message.replace("\x00", "").strip()
    if not message:
        return InputGuardrailResult(message="", blocked_response="Empty message.")
    if len(message) > MAX_INPUT_CHARS:
        message = message[:MAX_INPUT_CHARS]
    if INJECTION_RE.search(message):
        return InputGuardrailResult(
            message=message,
            blocked_response=(
                "I'm not able to process that request. "
                "If you have a data question, feel free to ask!"
            ),
        )
    return InputGuardrailResult(message=message)


def sanitize_output(response: str) -> str:
    """Redact sensitive patterns from the agent's final response text."""
    # Redact credential-like key=value pairs
    cleaned = re.sub(
        r"(password|api[_\-]?key|secret[_\-]?key|auth[_\-]?token)\s*[:=]\s*\S+",
        r"\1=[REDACTED]",
        response,
        flags=re.IGNORECASE,
    )
    # Strip Python traceback snippets
    cleaned = re.sub(r'File "[^"]+", line \d+.*', "[internal error details omitted]", cleaned)
    cleaned = re.sub(
        r"Traceback \(most recent call last\).*",
        "[internal error details omitted]",
        cleaned,
        flags=re.DOTALL,
    )
    return cleaned
