import ast
import json
import re
from typing import Any

import pandas as pd

from app.config.constants import Columns


def detect_data_format(df: pd.DataFrame) -> str:
    """Detect the format of uploaded data.

    Returns one of:
    - "eval_runner": New evaluation runner output format with run_id, dataset_id, passed
    - "tree_format": Hierarchical metrics with parent relationships
    - "flat_format": Simple metric scores in long format
    - "simple_judgment": Binary pass/fail judgments
    - "fresh_annotation": Raw outputs for annotation
    - "unknown": Could not detect format
    """
    # Check for new eval_runner format (has run_id, dataset_id, passed fields)
    eval_runner_fields = ["run_id", "dataset_id", "passed"]
    if all(col in df.columns for col in eval_runner_fields):
        return "eval_runner"

    # Check for tree format
    tree_columns = [Columns.METRIC_NAME, Columns.PARENT, Columns.METRIC_TYPE, Columns.METRIC_SCORE]
    if all(col in df.columns for col in tree_columns):
        return "tree_format"

    # Check for flat scores format
    if Columns.METRIC_NAME in df.columns and Columns.METRIC_SCORE in df.columns:
        return "flat_format"

    # Check for simple judgment format
    if "judgment" in df.columns:
        return "simple_judgment"

    # Check for fresh annotation format
    required_fresh = [
        Columns.DATASET_ID,
        Columns.EXPERIMENT_NAME,
        Columns.QUERY,
        Columns.ACTUAL_OUTPUT,
    ]
    if all(col in df.columns for col in required_fresh):
        return "fresh_annotation"

    return "unknown"


def detect_tree_format(df: pd.DataFrame) -> bool:
    """Check if the uploaded data is in tree format."""
    tree_columns = [Columns.METRIC_NAME, Columns.PARENT, Columns.METRIC_TYPE, Columns.METRIC_SCORE]
    return all(col in df.columns for col in tree_columns)


def add_default_product(df: pd.DataFrame) -> pd.DataFrame:
    """Add default metadata values."""
    needs_default = Columns.METADATA not in df.columns or (
        pd.isnull(df[Columns.METADATA].values[0]) if len(df) > 0 else True
    )
    if Columns.ADD_DEFAULT_PRODUCT and needs_default:
        df[Columns.METADATA] = "{}"
    return df


def add_columns_to_flat_format(df: pd.DataFrame) -> pd.DataFrame:
    """Add empty columns to flat format dataset for tree visualization compatibility."""
    df = df.copy()
    df[Columns.METRIC_TYPE] = "metric"
    df = add_default_product(df)
    df[Columns.PARENT] = None
    df[Columns.WEIGHT] = None
    return df


def back_compatible_naming(df: pd.DataFrame) -> pd.DataFrame:
    """Apply backwards-compatible column renames."""
    renames = {
        "experiment_name": "evaluation_name",
        "experiment_metadata": "evaluation_metadata",
    }
    return df.rename(columns=renames)


def safe_literal_eval(val: Any) -> Any:
    """Safely evaluate a string as a Python literal."""
    try:
        return ast.literal_eval(val)
    except (ValueError, SyntaxError):
        return val


def setup_fresh_annotation(df_raw: pd.DataFrame) -> pd.DataFrame | None:
    """Set up fresh annotation format."""
    try:
        df = df_raw.copy()

        # Validate required columns
        required_cols = [
            Columns.DATASET_ID,
            Columns.EXPERIMENT_NAME,
            Columns.QUERY,
            Columns.ACTUAL_OUTPUT,
        ]
        missing_cols = [col for col in required_cols if col not in df.columns]

        if missing_cols:
            return None

        # Add empty critique column
        if Columns.CRITIQUE not in df.columns:
            df[Columns.CRITIQUE] = ""

        # Add experiment metadata if missing
        if Columns.EXPERIMENT_METADATA not in df.columns:
            df[Columns.EXPERIMENT_METADATA] = "{}"

        return df

    except Exception:
        return None


def process_uploaded_data(df_raw: pd.DataFrame) -> tuple[pd.DataFrame | None, str | None, str]:
    """Process uploaded data and return processed dataframe, format, and message.

    Args:
        df_raw: Raw DataFrame from uploaded file

    Returns:
        Tuple of (processed_df, format_type, message)
    """
    try:
        df_raw = back_compatible_naming(df_raw)

        # First check if this is tree format data
        if detect_tree_format(df_raw):
            df = df_raw.copy()

            # Clean the parent column - convert empty strings to None
            df[Columns.PARENT] = df[Columns.PARENT].replace("", None)
            # Use mask to set NaN values to None (mask sets where condition is True)
            df[Columns.PARENT] = df[Columns.PARENT].mask(pd.isna(df[Columns.PARENT]), None)

            # Ensure we have required columns for the app
            if Columns.DATASET_ID not in df.columns:
                df[Columns.DATASET_ID] = "test_case_1"

            if Columns.EXPERIMENT_NAME not in df.columns:
                df[Columns.EXPERIMENT_NAME] = "Experiment 1"

            if Columns.QUERY not in df.columns:
                df[Columns.QUERY] = ""

            if Columns.ACTUAL_OUTPUT not in df.columns:
                df[Columns.ACTUAL_OUTPUT] = ""

            if Columns.EXPECTED_OUTPUT not in df.columns:
                df[Columns.EXPECTED_OUTPUT] = ""

            if Columns.EXPERIMENT_METADATA not in df.columns:
                df[Columns.EXPERIMENT_METADATA] = "{}"

            # Add default metadata if nothing passed
            df = add_default_product(df)

            # Handle retrieved content if it exists
            if Columns.RETRIEVED_CONTENT in df.columns:
                df[Columns.RETRIEVED_CONTENT] = df[Columns.RETRIEVED_CONTENT].apply(
                    lambda x: safe_literal_eval(x) if pd.notna(x) else []
                )

            # Add a critique column if it doesn't exist
            if Columns.CRITIQUE not in df.columns:
                df[Columns.CRITIQUE] = ""

            root_nodes = df[df[Columns.PARENT].isna()][Columns.METRIC_NAME].unique()
            message = f"Tree format with {len(df)} nodes, root: {', '.join(root_nodes)}"
            return df, "tree_format", message

        # If not tree format, detect other formats
        data_format = detect_data_format(df_raw)

        if data_format == "flat_format":
            # Add columns for tree visual
            df_raw = add_columns_to_flat_format(df_raw)
            return process_uploaded_data(df_raw)

        elif data_format == "simple_judgment":
            df = df_raw.copy()
            if "judgment" not in df.columns:
                return (
                    None,
                    None,
                    "Simple judgment format requires a 'judgment' column with 1/0 values",
                )

            if Columns.CRITIQUE not in df.columns:
                df[Columns.CRITIQUE] = ""

            message = f"Simple judgment format with {len(df)} evaluations"
            return df, "simple_judgment", message

        elif data_format == "fresh_annotation":
            annotation_df = setup_fresh_annotation(df_raw)
            if annotation_df is None:
                return None, None, "Failed to set up fresh annotation format"

            message = f"Fresh annotation for {len(annotation_df)} model outputs"
            return annotation_df, "fresh_annotation", message

        else:
            return (
                None,
                None,
                "Could not detect valid data format. Please check the sample formats.",
            )

    except Exception as e:
        return None, None, f"Error processing file: {e!s}"


def convert_to_csv(annotations: dict[str, Any]) -> str:
    """Convert annotations to CSV format for download."""
    if not annotations:
        return ""

    df = pd.DataFrame.from_dict(annotations, orient="index")
    result = df.to_csv(index=False)
    return result if result is not None else ""


def get_metrics_for_format(df: pd.DataFrame, data_format: str) -> list[str]:
    """Get metrics based on data format."""
    if data_format == "simple_judgment":
        return ["judgment"]
    elif data_format == "fresh_annotation":
        # Find all numeric columns except ID that aren't metadata
        return [
            col
            for col in df.columns
            if pd.api.types.is_numeric_dtype(df[col])
            and col
            not in [
                Columns.DATASET_ID,
                Columns.EXPERIMENT_NAME,
                Columns.QUERY,
                Columns.ACTUAL_OUTPUT,
            ]
        ]
    elif data_format == "tree_format":
        # For tree format, we'll handle this differently in the tree visualization
        return []
    else:  # flat
        return [
            col
            for col in df.columns
            if pd.api.types.is_numeric_dtype(df[col]) and col != Columns.DATASET_ID
        ]


def identify_metric_component_mapping(df: pd.DataFrame) -> dict[str, list[str]]:
    """Identify metrics and components in tree format data."""
    metric_options = list(df[df[Columns.METRIC_TYPE] == "metric"][Columns.METRIC_NAME].unique())
    component_options = list(
        df[df[Columns.METRIC_TYPE] == "component"][Columns.METRIC_NAME].unique()
    )
    return {"metrics": metric_options, "components": component_options}


def drop_latency(df: pd.DataFrame) -> pd.DataFrame:
    """Drop Latency Column if passed through config."""
    import contextlib

    if (
        Columns.DROP_LATENCY
        and Columns.LATENCY.lower() in [col.lower() for col in df.columns]
        and len(df) > 0
        and df[Columns.LATENCY].max() > 1
    ):
        for col in [Columns.LATENCY, "PERFORMANCE"]:
            with contextlib.suppress(KeyError, ValueError):
                df = df.drop(col, axis=1)
    return df


def convert_tree_to_wide_format(
    df: pd.DataFrame, metric_type: str | None = None, include_conversation: bool = False
) -> pd.DataFrame:
    """Convert tree format to wide format for analytics.

    Args:
        df: Input dataframe in tree format
        metric_type: Optional metric type filter
        include_conversation: Whether to include conversation column

    Returns:
        Wide-format dataframe
    """
    try:
        metric_df = df[df[Columns.METRIC_TYPE] == metric_type].copy() if metric_type else df.copy()
        if metric_df.empty:
            return pd.DataFrame()

        metric_df = add_default_product(metric_df)

        index_cols = [
            col
            for col in [
                Columns.DATASET_ID,
                Columns.EXPERIMENT_NAME,
                Columns.QUERY,
                Columns.ACTUAL_OUTPUT,
                Columns.EXPERIMENT_METADATA,
                Columns.METADATA,
            ]
            if col in metric_df.columns
        ]

        if include_conversation and Columns.CONVERSATION in metric_df.columns:
            index_cols.append(Columns.CONVERSATION)

        if len(index_cols) < 2:
            return pd.DataFrame()

        wide_df = metric_df.pivot_table(
            index=index_cols,
            columns=Columns.METRIC_NAME,
            values=Columns.METRIC_SCORE,
            aggfunc="first",
        ).reset_index()

        wide_df = drop_latency(wide_df)
        wide_df.columns.name = None
        return wide_df

    except Exception:
        return pd.DataFrame()


def prepare_data_for_analytics(
    data: list[dict[str, Any]],
    data_format: str,
    metric_type: str | None = None,
    include_conversation: bool = False,
) -> tuple[pd.DataFrame, list[str], dict[str, list[str]]]:
    """Prepare data for analytics display.

    Args:
        data: List or dict-like structure containing analytics data
        data_format: 'tree_format' or 'simple_judgment'
        metric_type: Filter for specific metric type
        include_conversation: Whether to include conversation column in output

    Returns:
        Tuple: (processed DataFrame, metric_columns list, mapping dict)
    """
    if not data:
        return pd.DataFrame(), [], {}

    df = pd.DataFrame(data)
    df = back_compatible_naming(df)
    mapping = (
        identify_metric_component_mapping(df)
        if Columns.METRIC_TYPE in df.columns
        else {"metrics": [], "components": []}
    )

    if data_format == "tree_format":
        df = convert_tree_to_wide_format(df, metric_type, include_conversation)
        if df.empty:
            return pd.DataFrame(), [], mapping

    elif data_format == "simple_judgment":
        df = df.copy()
        metric_columns = ["judgment"]
        return df, metric_columns, mapping

    index_cols = [
        Columns.DATASET_ID,
        Columns.EXPERIMENT_NAME,
        Columns.QUERY,
        Columns.ACTUAL_OUTPUT,
        Columns.EXPECTED_OUTPUT,
        Columns.EXPERIMENT_METADATA,
        Columns.METADATA,
    ]
    if include_conversation and Columns.CONVERSATION in df.columns:
        index_cols.append(Columns.CONVERSATION)
    if data_format != "tree_format":
        index_cols.append(Columns.CRITIQUE)

    metric_columns = [
        col
        for col in df.columns
        if col not in index_cols and pd.api.types.is_numeric_dtype(df[col])
    ]

    if include_conversation and Columns.CONVERSATION in df.columns:
        df[Columns.CONVERSATION] = df[Columns.CONVERSATION].map(
            lambda x: ast.literal_eval(x) if isinstance(x, str) else x
        )

    return df, metric_columns, mapping


def parse_json(data: str) -> dict[str, Any]:
    """Parses a string that may be malformed, double-encoded, or a Python literal.

    This version correctly handles python-specific values like nan, inf, and booleans.

    Returns:
        A dictionary object. Returns an empty dict ({}) if all parsing attempts fail.
    """
    if not isinstance(data, str) or not data.strip():
        return {}

    s = data.strip()

    try:
        loaded = json.loads(s)
        if isinstance(loaded, dict):
            return loaded
        return {}
    except json.JSONDecodeError:
        pass

    try:
        s = re.sub(r"\btrue\b", "True", s)
        s = re.sub(r"\bfalse\b", "False", s)
        s = s.replace("nan", "None").replace("inf", "None").replace("-inf", "None")
        result = ast.literal_eval(s)
        if isinstance(result, dict):
            return result
        if isinstance(result, str):
            loaded = json.loads(result)
            if isinstance(loaded, dict):
                return loaded
            return {}

    except (ValueError, SyntaxError, MemoryError, json.JSONDecodeError):
        return {}

    return {}


def process_database_data(df: pd.DataFrame) -> pd.DataFrame:
    """Process data coming from database format."""
    renames = {
        "question_id": Columns.DATASET_ID,
        "retriever": Columns.EXPERIMENT_NAME,
        "input": Columns.QUERY,
        "name": Columns.METRIC_NAME,
        "score": Columns.METRIC_SCORE,
        "reason": Columns.EXPLANATION,
        "retrieval_chunks": Columns.RETRIEVED_CONTENT,
    }
    df = df.rename(columns=renames)
    df = add_columns_to_flat_format(df)
    return df
