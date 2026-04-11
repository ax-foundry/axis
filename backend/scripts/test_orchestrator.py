#!/usr/bin/env python3
"""Test the orchestrator endpoint from the terminal.

Usage:
    python scripts/test_orchestrator.py "What is the overall pass rate?"
    python scripts/test_orchestrator.py "Show weekly UW Faithfulness trend" --dataset monitoring
    python scripts/test_orchestrator.py "What's the STP rate?" --dataset kpi
    python scripts/test_orchestrator.py "What is the pass rate?" --endpoint oai
    python scripts/test_orchestrator.py "Run a statistical test on Citation Accuracy" --endpoint orchestrator
"""

import argparse
import json
import subprocess
import sys

THOUGHT_ICONS = {
    "reasoning": "🧠", "tool_use": "🔧", "observation": "👁 ",
    "planning": "📋", "reflection": "🪞", "decision": "✅",
    "error": "❌", "success": "✅",
}

BASE_URL = "http://localhost:8500/api/ai"


def stream_sse(url: str, payload: dict) -> None:
    """Use curl subprocess for reliable SSE streaming (avoids Python HTTP lib SSE issues)."""
    import shlex

    json_payload = json.dumps(payload)
    cmd = (
        f"curl -s -N -X POST {shlex.quote(url)} "
        f"-H 'Content-Type: application/json' "
        f"-d {shlex.quote(json_payload)}"
    )

    thoughts = 0
    response = None
    chart = None

    proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = proc.communicate(timeout=180)
    full = stdout.decode("utf-8", errors="replace")

    if not full.strip():
        print("  [DEBUG] curl returned empty")
        return

    # Normalize CRLF to LF (SSE spec allows both)
    full = full.replace("\r\n", "\n")

    for block in full.split("\n\n"):
        block = block.strip()
        if not block:
            continue

        event_type = event_data = ""
        for line in block.split("\n"):
            if line.startswith("event:"):
                event_type = line[6:].strip()
            elif line.startswith("data:"):
                event_data = line[5:].strip()

        if not event_type:
            continue

        if event_type == "thought" and event_data:
            try:
                t = json.loads(event_data)
                icon = THOUGHT_ICONS.get(t.get("type", ""), "  ")
                node = f"[{t['node_name']}] " if t.get("node_name") else ""
                tool = f"({t['tool_name']}) " if t.get("tool_name") else ""
                content = t.get("content", "")[:120]
                print(f"  {icon} {node}{tool}{content}")
                thoughts += 1
            except json.JSONDecodeError:
                pass

        elif event_type == "response" and event_data:
            try:
                resp_data = json.loads(event_data)
                response = resp_data.get("response", "")
                chart = resp_data.get("chart")
            except json.JSONDecodeError:
                response = event_data

        elif event_type == "error" and event_data:
            try:
                err = json.loads(event_data)
                response = f"Error: {err.get('error', event_data)}"
            except json.JSONDecodeError:
                response = f"Error: {event_data}"

    print()
    print("=" * 60)
    if response:
        print(response)
    else:
        print("No response received.")
    print("=" * 60)
    print(f"{thoughts} thoughts")
    if chart:
        print("Chart spec returned")


def main():
    parser = argparse.ArgumentParser(description="Test the Echo orchestrator")
    parser.add_argument("message", help="Question to ask")
    parser.add_argument("--dataset", "-d", default="monitoring",
                        help="Dataset: monitoring, kpi, human_signals (default: monitoring)")
    parser.add_argument("--endpoint", "-e", default="orchestrator",
                        choices=["orchestrator", "oai", "pydantic"],
                        help="Which endpoint to hit (default: orchestrator)")
    parser.add_argument("--agent", "-a", default=None, help="Agent name filter")
    parser.add_argument("--base-url", default=BASE_URL, help="Server base URL")
    args = parser.parse_args()

    url_map = {
        "orchestrator": f"{args.base_url}/copilot/stream/orchestrator",
        "oai": f"{args.base_url}/copilot/stream/oai",
        "pydantic": f"{args.base_url}/copilot/stream",
    }
    url = url_map[args.endpoint]

    payload = {"message": args.message, "dataset_label": args.dataset}
    if args.agent:
        payload["agent_name"] = args.agent

    print(f"> {args.message}")
    print(f"  [{args.endpoint}] dataset={args.dataset}")
    print()

    try:
        stream_sse(url, payload)
    except KeyboardInterrupt:
        print("\nCancelled.")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
