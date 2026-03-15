# Ask Echo — Pydantic AI Architecture

> **Implementation:** `backend/app/copilot/agent.py`
> **Endpoint:** `POST /api/ai/copilot/stream`
> **Framework:** [pydantic-ai](https://ai.pydantic.dev/) (`pydantic-ai>=0.0.14`)

---

## Overview

Ask Echo (pydantic-ai) is the primary copilot implementation. It uses pydantic-ai's
`Agent` class as the orchestrator, which internally manages an LLM → tool call → LLM
loop. Tools are registered as async closures on the agent instance; there is no
explicit graph — pydantic-ai's loop is implicit inside `agent.run()`.

```
User message
     │
     ▼
CopilotRequest (Pydantic)
     │
     ▼
POST /api/ai/copilot/stream
     │
     ├──► ThoughtStream (pub/sub queue)
     │
     ▼
CopilotAgent.process()
     │
     ├──► emit_reasoning("Processing…")       [REASONING thought]
     │
     ▼
pydantic-ai Agent.run(full_message, deps=CopilotDeps)
     │
     │  ┌─────────────────── LLM loop (implicit) ──────────────────┐
     │  │                                                            │
     │  │  LLM decides tool → tool runs → result fed back to LLM   │
     │  │  Repeat until LLM produces a final string output          │
     │  └────────────────────────────────────────────────────────── ┘
     │
     ├──► Tool: summarize_data    ──► emit_tool_use + emit_observation
     ├──► Tool: query_data        ──► emit_tool_use + emit_observation
     ├──► Tool: analyze_data      ──► emit_tool_use + emit_observation
     ├──► Tool: compare_data      ──► emit_tool_use + emit_observation
     └──► Tool: query_kpi_data    ──► emit_tool_use + emit_observation
                                                │
                                                ▼ (DuckDB SQL)
                                         DuckDBStore.query_list()
                                         (via anyio thread pool)
     │
     ├──► emit_success("Request completed")  [SUCCESS thought]
     ▼
ThoughtStream.close()  →  None sentinel  →  subscriber loop ends
     │
     ▼
SSE: event: response  {success, response, thoughts_count}
SSE: event: done
```

---

## Component Map

| Layer | File | Role |
|---|---|---|
| **Orchestrator** | `copilot/agent.py` · `CopilotAgent` | Owns the pydantic-ai `Agent`; registers tools; drives the loop via `agent.run()` |
| **Deps / Context** | `copilot/agent.py` · `CopilotDeps` | Dataclass injected into every tool call; carries `ThoughtStream`, `dataset_label`, session cache |
| **Tools** | `copilot/agent.py` · `_register_tools()` | 5 async closures registered with `@agent.tool`; emit thoughts; call DuckDB via anyio |
| **Thought system** | `copilot/thoughts.py` | `ThoughtStream`, `ThoughtStreamIterator`, `Thought`, `ThoughtType` |
| **LLM provider** | `copilot/llm/provider.py` · `LLMProvider` | Builds pydantic-ai `OpenAIModel` / `AnthropicModel`; reads `settings` for credentials |
| **Schemas** | `models/copilot_schemas.py` | `CopilotRequest`, `CopilotResponse`, `ThoughtSchema`, `SSEEventType` |
| **Router** | `routers/ai.py` · `copilot_stream()` | FastAPI endpoint; creates `ThoughtStream` + `CopilotAgent`; drives subscriber + SSE |
| **Data store** | `services/duckdb_store.py` | `get_store()`, `DATASET_TABLE_MAP`, `has_table()`, `query_list()`, `query_value()`, `get_metadata()` |

---

## Orchestrator — `CopilotAgent`

```python
class CopilotAgent:
    thought_stream: ThoughtStream
    llm_provider:   LLMProvider
    _agent:         Agent[CopilotDeps, str] | None   # lazy
```

### Initialization

`_get_agent()` is lazy — the pydantic-ai `Agent` is created on first call:

```python
model = self.llm_provider._get_model()   # → OpenAIModel or AnthropicModel

self._agent = Agent(
    model,
    deps_type=CopilotDeps,
    system_prompt="You are Ask Echo, an AI assistant...",
)

@self._agent.system_prompt          # ← dynamic context injected at runtime
def _dataset_context(ctx: RunContext[CopilotDeps]) -> str:
    # Returns: "Current dataset: evaluation | Table: eval_data | Rows: 73 | Columns: ..."
    ...

self._register_tools()
```

The dynamic `@system_prompt` decorator is a pydantic-ai feature that appends a
runtime string to the system prompt on every LLM call — the agent always knows the
current table name, row count, and column list without those being part of the user
message.

### The Loop

`agent.run(full_message, deps=deps)` drives a **synchronous loop** inside pydantic-ai:

1. LLM receives system prompt + conversation
2. LLM emits either a **tool call** or a **final text output**
3. If tool call → pydantic-ai executes the tool, appends result, loops back to step 1
4. If text output → `result.output` is returned

There is no explicit graph in this implementation. The loop is fully managed by
pydantic-ai internally.

---

## Tools

All 5 tools follow the same pattern: registered with `@agent.tool`, emit thoughts,
query DuckDB via `anyio.to_thread.run_sync`, cache results in `CopilotDeps._cache`.

| Tool | Purpose | Key SQL |
|---|---|---|
| `summarize_data` | Schema + row count + filter values + numeric min/avg/max | `SELECT AVG/MIN/MAX … FROM {table}` |
| `query_data` | Record lookup; filter by column/value; min/max record; text search | `SELECT * FROM {table} WHERE … LIMIT n` |
| `analyze_data` | Full statistics per numeric column | `SELECT AVG, STDDEV, MEDIAN, QUANTILE_CONT … FROM {table}` |
| `compare_data` | Group-by averages across categorical columns | `SELECT group, AVG(metric) … GROUP BY group ORDER BY _count DESC` |
| `query_kpi_data` | KPI table lookup with optional category filter | `SELECT * FROM kpi_data WHERE kpi_category ILIKE …` |

### Tool signature pattern

```python
@agent.tool
async def summarize_data(
    ctx: RunContext[CopilotDeps],          # ← pydantic-ai injects this
    include_numeric_stats: bool = True,
) -> str:
    deps = ctx.deps                        # ← access context via ctx.deps
    await deps.thought_stream.emit_tool_use("Summarizing…", skill_name="summarize_data")
    # … DuckDB query …
    await deps.thought_stream.emit_observation("Summary: N rows, M cols", skill_name=…)
    return _safe_json(result)
```

### Threading

DuckDB is synchronous. All queries are wrapped in `anyio.to_thread.run_sync` with a
shared `store.query_limiter` (anyio `CapacityLimiter`) to prevent thread exhaustion:

```python
rows = await anyio.to_thread.run_sync(
    lambda: store.query_list(sql),
    limiter=store.query_limiter,
)
```

### Session cache

`CopilotDeps._cache` is a dict keyed by `{tool}:{hash(params)}:{table}:{row_count}`.
This means cache hits are invalidated automatically when the dataset changes (different
row count = different key).

---

## Deps / Context — `CopilotDeps`

```python
@dataclass
class CopilotDeps:
    thought_stream: ThoughtStream
    dataset_label:  str = "evaluation"
    data_context:   dict[str, Any]        # schema hints from frontend
    _cache:         dict[str, str]        # per-request in-memory cache

    @property
    def table_name(self) -> str:          # e.g. "eval_data", "monitoring_data"
    @property
    def store(self):                      # → DuckDBStore singleton
    @property
    def has_data(self) -> bool:           # store.has_table(table_name)
    def get_cached(…) / set_cached(…)     # cache read/write
    def no_data_error(self) -> str        # standard JSON error
```

`CopilotDeps` is created per-request and passed to pydantic-ai as `deps=`. The
framework injects it into every tool call via `ctx.deps`.

---

## Thought System

### `ThoughtStream` — asyncio queue-based pub/sub

```
emit*(content) ──► Thought(type, content, node, skill, metadata, id, ts)
                        │
                        ▼
               asyncio.Queue[Thought | None]
                        │
                   subscribe() ──► ThoughtStreamIterator
                        │
               async for thought in subscriber:
                   yield SSE event: thought
                        │
               close() ──► put(None) ──► StopAsyncIteration
```

### Thought types and colors

| Type | Color | When emitted |
|---|---|---|
| `reasoning` | `#3B82F6` blue | Entry of `process()` — "Processing: …" |
| `tool_use` | `#8B5CF6` purple | Each tool invocation start |
| `observation` | `#10B981` green | Each tool result summary |
| `planning` | `#F59E0B` amber | *(available, not currently emitted by this agent)* |
| `reflection` | `#6366F1` indigo | *(available)* |
| `decision` | `#EC4899` pink | *(available)* |
| `error` | `#EF4444` red | Exception in `process()` |
| `success` | `#22C55E` green | Normal completion |

### Concurrency model

The router creates `asyncio.create_task(agent.process(…))` and then:

```python
subscriber = await thought_stream.subscribe()

async for thought in subscriber:         # blocks until next thought or None
    yield SSE thought event

response = await task                    # wait for process() to finish
yield SSE response event
```

The `ThoughtStream` queue decouples the producer (tool callbacks) from the
consumer (SSE generator). Thoughts stream to the client in real time while the
agent is still running.

---

## LLM Provider — `LLMProvider`

```
LLMProvider(provider="openai", model="gpt-5.2")
      │
      ▼
_get_model()
      ├── OpenAI:    OpenAIProvider(api_key, base_url?) → OpenAIModel(model_name, provider)
      └── Anthropic: AnthropicProvider(api_key)         → AnthropicModel(model_name, provider)
```

Reads from `app.config.env.settings`:
- `settings.gateway_api_key` (preferred) or `settings.openai_api_key`
- `settings.openai_api_base` (optional base URL override for gateway/proxy)
- `settings.anthropic_api_key`
- `settings.llm_model_name`

`get_default_provider()` prefers OpenAI over Anthropic if both are set.

---

## SSE Contract

Both endpoints share the same four event types:

```
event: thought
data: {"id":"uuid","type":"tool_use","content":"Querying data...","skill_name":"query_data","node_name":null,"color":"#8B5CF6","timestamp":"…"}

event: thought
data: {"id":"uuid","type":"observation","content":"Query returned 42 matching records","skill_name":"query_data",…}

event: response
data: {"success":true,"response":"Here is the analysis…","thoughts_count":5}

event: done
data:
```

Error path:
```
event: error
data: {"error":"Ask Echo is not configured. Please set up OpenAI or Anthropic API credentials."}

event: done
data:
```

---

## Data Flow — End to End

```
Browser                  Next.js (proxy)         FastAPI                  DuckDB
  │                           │                     │                       │
  │  POST /api/ai/copilot/    │                     │                       │
  │  stream + JSON body  ──►  │  ──► /api/ai/       │                       │
  │                           │     copilot/stream  │                       │
  │                           │                     │ create ThoughtStream  │
  │                           │                     │ create CopilotAgent   │
  │                           │                     │ create_task(process)  │
  │                           │                     │                       │
  │  ◄── SSE: thought ──────────────────────────── │ emit_reasoning        │
  │                           │                     │                       │
  │                           │                     │ agent.run(msg, deps)  │
  │                           │                     │   LLM picks tool      │
  │                           │                     │   @agent.tool fires   │
  │  ◄── SSE: thought ──────────────────────────── │ emit_tool_use         │
  │                           │                     │                       │ SQL query
  │                           │                     │ anyio thread ────────►│
  │                           │                     │ ◄─────────────────────│ rows
  │  ◄── SSE: thought ──────────────────────────── │ emit_observation      │
  │                           │                     │   (more turns…)       │
  │                           │                     │ agent returns str     │
  │  ◄── SSE: thought ──────────────────────────── │ emit_success          │
  │  ◄── SSE: response ─────────────────────────── │                       │
  │  ◄── SSE: done ─────────────────────────────── │                       │
```

---

## Frontend Integration

```
useCopilotStream()  (hooks.ts)
      │
      ├── reads: selectedDataset, conversationHistory, provider
      │          (provider === 'pydantic-ai' → /api/ai/copilot/stream)
      │
      ├── builds: dataContext (schema hints only — data is in DuckDB)
      │
      └── calls: createCopilotStream(options, handlers)  (sse.ts)
                      │
                      ├── onThought  → store.addThought(t)   → ThoughtPanel renders
                      ├── onResponse → store.setFinalResponse  → message appended
                      ├── onError    → store.setError
                      └── onDone     → store.stopStreaming
```

### ThoughtPanel rendering

```
useCopilotStore.thoughts[]
        │
        ▼
ThoughtPanel (collapsible, auto-expands when isStreaming)
        │
        └── ThoughtItem × N
                ├── Icon   (Brain / Wrench / Eye / ListTodo / Lightbulb / GitBranch / AlertCircle / CheckCircle)
                ├── Label  (Thinking / Using Tool / Observing / Planning / Reflecting / Deciding / Error / Complete)
                ├── skill_name badge  (purple pill, e.g. "query_data")
                ├── node_name label   (grey, e.g. "Agent")
                └── content + timestamp
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Tools as closures on `self._agent` | pydantic-ai requires `@agent.tool` registration; closures capture `agent` without a global ref |
| `CopilotDeps` dataclass | pydantic-ai's `deps_type=` pattern; injected into every tool via `RunContext[CopilotDeps]` |
| `anyio.to_thread.run_sync` for DuckDB | DuckDB's Python API is sync; `anyio` bridges it to the async event loop safely |
| Per-request in-memory cache | Avoids re-running identical SQL on the same dataset within one conversation turn |
| Dynamic `@system_prompt` | Ensures LLM always knows current schema without user having to mention it |
| History embedded in message | pydantic-ai's `agent.run()` doesn't natively support multi-turn history; prior turns are prepended to the message string |
| `ThoughtStream` as asyncio queue | Decouples slow tool execution from the SSE generator; thoughts stream in real time |
