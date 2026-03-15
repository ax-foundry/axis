# Ask Echo — OpenAI Agents SDK Architecture

> **Implementation:** `backend/app/copilot/oai_agent.py`
> **Endpoint:** `POST /api/ai/copilot/stream/oai`
> **Framework:** [openai-agents](https://openai.github.io/openai-agents-python/) (`openai-agents>=0.0.14`, installed as `agents` module)

---

## Overview

Ask Echo (OAI) is a parallel implementation using the OpenAI Agents SDK. The SDK
provides its own tool registration pattern (`@function_tool`), a lifecycle hook
system (`RunHooks`), and a streaming runner (`Runner.run_streamed`). Tools are
defined at **module level** — not as closures — which is the primary structural
difference from the pydantic-ai version.

```
User message
     │
     ▼
CopilotRequest (same Pydantic schema)
     │
     ▼
POST /api/ai/copilot/stream/oai
     │
     ├──► ThoughtStream (same pub/sub queue)
     │
     ▼
OAIEchoAgent.process()
     │
     ├──► emit_reasoning("Processing…")        [REASONING thought]
     │
     ▼
Runner.run_streamed(agent, input, context=OAIContext, hooks=EchoRunHooks)
     │
     │  ┌──────────────── SDK runner loop ─────────────────────┐
     │  │                                                        │
     │  │  LLM decides tool → EchoRunHooks.on_tool_start fires  │
     │  │  Tool executes → EchoRunHooks.on_tool_end fires        │
     │  │  Result fed back to LLM → repeat until final output   │
     │  └────────────────────────────────────────────────────── ┘
     │
     │  ┌──────── async for event in result.stream_events() ───┐
     │  │  RunItemStreamEvent(name="reasoning_item_created")    │
     │  │  → emit_reasoning(text)      [o-series models only]   │
     │  └────────────────────────────────────────────────────── ┘
     │
     ├──► emit_success("Request completed")   [SUCCESS thought]
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
| **Orchestrator** | `copilot/oai_agent.py` · `OAIEchoAgent` | Owns the SDK `Agent`; configures OpenAI client; drives the loop via `Runner.run_streamed()` |
| **Context** | `copilot/oai_agent.py` · `OAIContext` | Dataclass passed as `context=` to the runner; carries `ThoughtStream`, `dataset_label`, session cache |
| **Lifecycle hooks** | `copilot/oai_agent.py` · `EchoRunHooks` | Subclass of `RunHooks[OAIContext]`; intercepts `on_tool_start` / `on_tool_end`; emits thoughts |
| **Tools** | `copilot/oai_agent.py` · `_ECHO_TOOLS` | 5 module-level `@function_tool` functions; same DuckDB logic as pydantic-ai version |
| **Thought system** | `copilot/thoughts.py` | **Shared with pydantic-ai** — `ThoughtStream`, `ThoughtStreamIterator`, `Thought`, `ThoughtType` |
| **LLM provider** | `copilot/llm/provider.py` · `LLMProvider` | **Shared with pydantic-ai** — reads credentials; OAI agent uses `.model` string + custom `AsyncOpenAI` client |
| **Schemas** | `models/copilot_schemas.py` | **Shared** — `CopilotRequest`, `SSEEventType` |
| **Router** | `routers/ai.py` · `copilot_stream_oai()` | New FastAPI endpoint; identical SSE logic to pydantic-ai endpoint |
| **Data store** | `services/duckdb_store.py` | **Shared** — same `get_store()`, `DATASET_TABLE_MAP`, `query_list()` etc. |

---

## Orchestrator — `OAIEchoAgent`

```python
class OAIEchoAgent:
    thought_stream: ThoughtStream
    llm_provider:   LLMProvider
    _agent:         Agent[OAIContext] | None   # lazy
```

### Initialization — `_get_agent()`

Unlike pydantic-ai, the SDK `Agent` must be given an OpenAI-compatible client.
`_get_agent()` configures the SDK's default client before building the agent:

```python
# 1. Configure the SDK's global client with gateway/OpenAI credentials
api_key = settings.gateway_api_key or settings.openai_api_key
if api_key:
    client_kwargs = {"api_key": api_key}
    if settings.openai_api_base:
        client_kwargs["base_url"] = settings.openai_api_base
    set_default_openai_client(AsyncOpenAI(**client_kwargs), use_for_tracing=False)

# 2. Build the Agent — tools are module-level FunctionTool objects
self._agent = Agent(
    name="Ask Echo (OAI)",
    instructions=_SYSTEM_PROMPT,       # static string — no dynamic prompt injection
    tools=_ECHO_TOOLS,                 # [summarize_data, query_data, …]
    model=self.llm_provider.model,     # e.g. "gpt-5.2"
)
```

**Key difference from pydantic-ai:** There is no dynamic `@system_prompt` injection.
Dataset context (table name, row count, columns) is not automatically appended to
every LLM call — the LLM must discover the schema by calling `summarize_data`.

### The Loop

`Runner.run_streamed(agent, input, context, hooks)` returns a `RunResultStreaming`
object immediately (sync). The actual run happens asynchronously:

```python
result = Runner.run_streamed(…)      # sync — returns RunResultStreaming
async for event in result.stream_events():
    if isinstance(event, RunItemStreamEvent) and event.name == "reasoning_item_created":
        # capture o-series reasoning trace
        await self.thought_stream.emit_reasoning(text, node_name="OAIAgent")
output = result.final_output         # set after stream_events() is exhausted
```

The loop inside the SDK works the same way as pydantic-ai:
LLM → tool call(s) → LLM → … → final text output. The difference is that
lifecycle events are surfaced through `RunHooks` and `stream_events()` rather
than being implicit.

---

## Tools

Tools are defined at module level as `@function_tool` decorated async functions.
This is the most significant structural difference from pydantic-ai, where tools
are closures registered on a specific agent instance.

### Registration

```python
from agents import function_tool as ft

@ft
async def summarize_data(
    ctx: RunContextWrapper[OAIContext],   # ← SDK injects this (NOT ctx.deps — ctx.context)
    include_numeric_stats: bool = True,
) -> str:
    deps = ctx.context                    # ← access context via ctx.context
    …
```

The SDK inspects the function's type annotations and docstring to build the JSON
schema it sends to the LLM as a tool definition.

### Module-level tool list

```python
_ECHO_TOOLS: list[FunctionTool] = [
    summarize_data,
    query_data,
    analyze_data,
    compare_data,
    query_kpi_data,
]
```

These are reusable objects. The same list could be passed to multiple `Agent`
instances or shared across test fixtures.

### Tool table

| Tool | Purpose | Key SQL |
|---|---|---|
| `summarize_data` | Schema + row count + filter values + numeric min/avg/max | `SELECT AVG/MIN/MAX … FROM {table}` |
| `query_data` | Record lookup; filter by column/value; min/max record; text search | `SELECT * FROM {table} WHERE … LIMIT n` |
| `analyze_data` | Full statistics per numeric column | `SELECT AVG, STDDEV, MEDIAN, QUANTILE_CONT … FROM {table}` |
| `compare_data` | Group-by averages across categorical columns | `SELECT group, AVG(metric) … GROUP BY group ORDER BY _count DESC` |
| `query_kpi_data` | KPI table lookup with optional category filter | `SELECT * FROM kpi_data WHERE kpi_category ILIKE …` |

The SQL logic inside each tool is **identical** to the pydantic-ai version.
Only the context access pattern differs (`ctx.context` vs `ctx.deps`).

### Threading

Identical to pydantic-ai: DuckDB queries run in `anyio.to_thread.run_sync` with
`store.query_limiter`.

### Session cache

Identical to pydantic-ai: `OAIContext._cache` keyed by
`{tool}:{hash(params)}:{table}:{row_count}`.

---

## Context — `OAIContext`

```python
@dataclass
class OAIContext:
    thought_stream: ThoughtStream
    dataset_label:  str = "evaluation"
    data_context:   dict[str, Any]        # schema hints from frontend
    _cache:         dict[str, str]        # per-request in-memory cache

    @property
    def table_name(self) -> str
    @property
    def store(self)
    @property
    def has_data(self) -> bool
    def get_cached(…) / set_cached(…)
    def no_data_error(self) -> str
```

Passed to `Runner.run_streamed(…, context=oai_ctx)`. The SDK injects it into
every tool call via `RunContextWrapper[OAIContext]`, accessible as `ctx.context`.

**Comparison to `CopilotDeps`:**

| Aspect | `CopilotDeps` (pydantic-ai) | `OAIContext` (OAI SDK) |
|---|---|---|
| Access in tool | `ctx.deps` | `ctx.context` |
| Wrapper type | `RunContext[CopilotDeps]` | `RunContextWrapper[OAIContext]` |
| Contents | identical | identical |

---

## Lifecycle Hooks — `EchoRunHooks`

The `RunHooks` system is the SDK's primary extensibility mechanism. It replaces
pydantic-ai's approach of manually calling `emit_*` inside tool code (though OAI
tools still call `emit_observation` directly for result summaries).

```python
class EchoRunHooks(RunHooks[OAIContext]):

    async def on_tool_start(
        self,
        context: RunContextWrapper[OAIContext],
        agent: Any,
        tool: Any,
    ) -> None:
        tool_name = getattr(tool, "name", str(tool))
        await context.context.thought_stream.emit_tool_use(
            f"Using tool: {tool_name}",
            skill_name=tool_name,
        )

    async def on_tool_end(
        self,
        context: RunContextWrapper[OAIContext],
        agent: Any,
        tool: Any,
        result: str,
    ) -> None:
        tool_name = getattr(tool, "name", str(tool))
        await context.context.thought_stream.emit_observation(
            f"Tool {tool_name} completed",
            skill_name=tool_name,
        )
```

### Available hook methods (from `RunHooksBase`)

| Method | When called |
|---|---|
| `on_llm_start` | Just before each LLM call |
| `on_llm_end` | Immediately after each LLM response |
| `on_agent_start` | Each time the active agent changes |
| `on_agent_end` | When the agent produces final output |
| `on_handoff` | When a handoff to another agent occurs |
| `on_tool_start` | **Used** — immediately before a tool is invoked |
| `on_tool_end` | **Used** — immediately after a tool returns |

`EchoRunHooks` uses only `on_tool_start` and `on_tool_end`. The others are no-ops
inherited from the base class. `on_llm_start`/`on_llm_end` could be used in future
to emit `reasoning` thoughts for non-o-series models.

### Hook vs. in-tool emit

Because `on_tool_start` fires before the tool body runs, the "Using tool: …"
thought arrives at the client slightly earlier than in pydantic-ai, where the
same `emit_tool_use` is called at the top of the tool function. In practice the
difference is imperceptible, but it matters for exact thought ordering.

---

## Streaming — `Runner.run_streamed` + `stream_events()`

```python
result = Runner.run_streamed(
    agent,
    input=full_message,
    context=oai_ctx,
    hooks=EchoRunHooks(),
)

async for event in result.stream_events():
    if (
        isinstance(event, RunItemStreamEvent)
        and event.name == "reasoning_item_created"
    ):
        # o-series models (o3, o4-mini, etc.) emit reasoning traces
        raw = event.item
        text = getattr(raw, "text", None) or getattr(
            getattr(raw, "raw_item", None), "text", ""
        )
        if text:
            await self.thought_stream.emit_reasoning(text, node_name="OAIAgent")

output = result.final_output   # str — available after stream_events() completes
```

### `StreamEvent` types in `stream_events()`

The SDK emits two categories of events:

| Category | Type | Name values |
|---|---|---|
| `RunItemStreamEvent` | `type="run_item_stream_event"` | `message_output_created`, `tool_called`, `tool_output`, **`reasoning_item_created`**, `handoff_requested`, … |
| `RawResponsesStreamEvent` | `type="raw_response_event"` | Raw OpenAI API response chunks |

Only `reasoning_item_created` is handled — it captures the chain-of-thought text
emitted by o-series reasoning models (o3, o4-mini). For standard GPT models,
no reasoning items are emitted and the `async for` loop is a no-op.

---

## Thought System (shared)

Both agents use the exact same `ThoughtStream` / `ThoughtStreamIterator` / `Thought`
from `copilot/thoughts.py`. See the pydantic-ai architecture doc for full details.

### Thought emission comparison

| Event | pydantic-ai source | OAI SDK source |
|---|---|---|
| `reasoning` (start) | `agent.process()` manually | `agent.process()` manually |
| `tool_use` | Inside tool body (`emit_tool_use`) | `EchoRunHooks.on_tool_start` |
| `observation` (tool result) | Inside tool body (`emit_observation`) | Inside tool body (`emit_observation`) |
| `reasoning` (o-series trace) | *(not supported)* | `RunItemStreamEvent.reasoning_item_created` |
| `error` | Exception handler in `process()` | Exception handler in `process()` |
| `success` | `process()` after `agent.run()` returns | `process()` after `stream_events()` completes |

---

## SSE Contract (identical to pydantic-ai)

```
event: thought
data: {"id":"uuid","type":"tool_use","content":"Using tool: summarize_data","skill_name":"summarize_data","node_name":null,"color":"#8B5CF6","timestamp":"…"}

event: thought
data: {"id":"uuid","type":"observation","content":"Tool summarize_data completed","skill_name":"summarize_data",…}

event: response
data: {"success":true,"response":"Here is the analysis…","thoughts_count":5}

event: done
data:
```

---

## Data Flow — End to End

```
Browser                  Next.js (proxy)         FastAPI                    SDK / DuckDB
  │                           │                     │                           │
  │  POST /api/ai/copilot/    │                     │                           │
  │  stream/oai + JSON   ──►  │  ──► /api/ai/       │                           │
  │                           │     copilot/stream/ │                           │
  │                           │     oai             │                           │
  │                           │                     │ create ThoughtStream      │
  │                           │                     │ create OAIEchoAgent       │
  │                           │                     │ create_task(process)      │
  │                           │                     │                           │
  │  ◄── SSE: thought ────────────────────────────  │ emit_reasoning            │
  │                           │                     │                           │
  │                           │                     │ Runner.run_streamed()     │
  │                           │                     │   LLM picks tool          │
  │                           │                     │   EchoRunHooks.           │
  │  ◄── SSE: thought ────────────────────────────  │   on_tool_start fires     │
  │                           │                     │                           │ SQL query
  │                           │                     │ anyio thread ────────────►│
  │                           │                     │ ◄─────────────────────────│ rows
  │  ◄── SSE: thought ────────────────────────────  │ emit_observation (tool)   │
  │                           │                     │   EchoRunHooks.           │
  │  ◄── SSE: thought ────────────────────────────  │   on_tool_end fires       │
  │                           │                     │   (more turns…)           │
  │                           │                     │ stream_events() exhausted │
  │  ◄── SSE: thought ────────────────────────────  │ emit_success              │
  │  ◄── SSE: response ───────────────────────────  │                           │
  │  ◄── SSE: done ───────────────────────────────  │                           │
```

---

## Frontend Integration

```
useCopilotStream()  (hooks.ts)
      │
      ├── reads: provider  (from copilot-store.ts)
      │   provider === 'oai-agents'  →  streamUrl = '/api/ai/copilot/stream/oai'
      │   provider === 'pydantic-ai' →  streamUrl = '/api/ai/copilot/stream'
      │
      └── calls: createCopilotStream({ …, stream_url: streamUrl }, handlers)
```

### Provider toggle (CopilotSidebar)

```tsx
// copilot-store.ts
provider: CopilotProvider   // 'pydantic-ai' | 'oai-agents'  (default 'pydantic-ai')
setProvider: (p) => void

// copilot-sidebar.tsx — pill toggle rendered between dataset picker and ThoughtPanel
{(['pydantic-ai', 'oai-agents'] as const).map((p) => (
  <button onClick={() => setProvider(p)}
    className={cn(
      'rounded-full px-2.5 py-0.5 text-xs font-medium',
      provider === p ? 'bg-primary text-white' : 'bg-gray-100 text-text-muted hover:bg-gray-200'
    )}>
    {p === 'pydantic-ai' ? 'Pydantic AI' : 'OAI Agents'}
  </button>
))}
```

Switching the toggle does not abort an in-flight request — it only affects the
next message sent.

---

## Side-by-Side Comparison

| Aspect | Pydantic AI | OpenAI Agents SDK |
|---|---|---|
| **Package** | `pydantic-ai` | `openai-agents` (module: `agents`) |
| **Agent class** | `pydantic_ai.Agent[CopilotDeps, str]` | `agents.Agent[OAIContext]` |
| **Tool registration** | `@agent.tool` closures on instance | `@function_tool` module-level functions |
| **Context access** | `ctx.deps` | `ctx.context` |
| **Context type** | `RunContext[CopilotDeps]` | `RunContextWrapper[OAIContext]` |
| **Dynamic system prompt** | `@agent.system_prompt` decorator | Not used (static `instructions=` string) |
| **Tool hooks** | Manual `emit_*` inside tool body | `EchoRunHooks.on_tool_start` / `on_tool_end` |
| **Run call** | `await agent.run(msg, deps=deps)` | `Runner.run_streamed(agent, msg, context=ctx, hooks=hooks)` |
| **Streaming** | `asyncio.create_task` + thought queue only | `result.stream_events()` + thought queue |
| **Reasoning trace** | Not supported | `RunItemStreamEvent("reasoning_item_created")` for o-series |
| **Multi-turn history** | Prepended to message string | Prepended to message string (same) |
| **LLM providers** | OpenAI + Anthropic | OpenAI / gateway only (SDK limitation) |
| **Tool reuse** | Bound to one agent instance | Module-level list, shareable |
| **Thought: tool_use** | Emitted at top of tool function | Emitted by `on_tool_start` hook (earlier) |
| **Thought: observation** | Emitted at bottom of tool function | Emitted at bottom of tool function + `on_tool_end` |

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Module-level `@function_tool` | SDK design — tools are standalone objects, not bound to an agent; enables future sharing or testing in isolation |
| `EchoRunHooks` for tool thoughts | Separates observability from business logic; hooks fire even if the tool raises an exception |
| `set_default_openai_client` in `_get_agent()` | SDK requires an `AsyncOpenAI` client; this injects the gateway/custom base URL without changing global process state until the agent is first used |
| `Runner.run_streamed` + `stream_events()` | Allows capturing o-series `reasoning_item_created` events; also future-proofs for handoff and guardrail events |
| Static `instructions=` (no dynamic prompt) | SDK supports dynamic `instructions` via a callable, but the tradeoff is LLM must call `summarize_data` to discover schema rather than having it pre-injected |
| Shared `ThoughtStream` / `CopilotRequest` / `DuckDBStore` | Zero duplication of infrastructure; only the agent framework layer differs between the two implementations |
