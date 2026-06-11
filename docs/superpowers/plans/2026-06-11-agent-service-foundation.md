# Agent Service Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Python agent service with a working Sensei HTTP contract (`/execute` + `/health`), the typed reply envelope, and a stub orchestrator — a running endpoint Sensei can hit and we can test.

**Architecture:** A FastAPI app exposes `POST /execute` (accepts Sensei's `{task, context}`, returns `{response, structured}`) and `GET /health`. Internally, a stub Orchestrator turns a request into a typed `AgentReply` envelope; the API layer projects that envelope to the Sensei wire shape. The stub is replaced by the real Hermes-backed orchestrator in a later plan — this plan locks the boundary and the contract.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, uvicorn, uv (deps), pytest + FastAPI TestClient.

---

## Plan sequence (context)

This is **Plan 1 of 7** (see the design spec §1–§15). Later plans: (2) storage layer, (3) integration layer, (4) workflow engine, (5) Hermes integration, (6) self-test harness, (7) dashboard. This plan is independent of all of them and is built/tested against the stub orchestrator.

## File structure (created in this plan)

```
service/                              # Python agent service (dashboard lives elsewhere later)
  pyproject.toml                      # uv project + deps
  README.md                           # how to run/test the service
  src/pixushr/
    __init__.py
    main.py                           # FastAPI app: /health + /execute
    api/
      __init__.py
      models.py                       # Sensei wire models + AgentReply envelope
    orchestrator/
      __init__.py
      stub.py                         # stub orchestrator (replaced in Plan 5)
  tests/
    __init__.py
    test_health.py                    # /health contract
    test_models.py                    # envelope <-> wire projection
    test_execute.py                   # /execute Sensei contract
```

Responsibilities: `api/models.py` owns the data contract (the one place wire+envelope shapes live); `orchestrator/stub.py` owns request→reply logic (swappable); `main.py` owns only HTTP wiring (thin, like the spec's Platform Edge).

---

### Task 1: Scaffold the Python service

**Files:**
- Create: `service/pyproject.toml`
- Create: `service/src/pixushr/__init__.py`
- Create: `service/src/pixushr/api/__init__.py`
- Create: `service/src/pixushr/orchestrator/__init__.py`
- Create: `service/tests/__init__.py`

- [ ] **Step 1: Create the project manifest**

Create `service/pyproject.toml`:

```toml
[project]
name = "pixushr"
version = "0.1.0"
description = "PixushHR onboarding/offboarding agent service"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
]

[dependency-groups]
dev = [
    "pytest>=8.3",
    "httpx>=0.27",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/pixushr"]

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

- [ ] **Step 2: Create empty package files**

Create these four files, each empty (just an empty file is fine):
- `service/src/pixushr/__init__.py`
- `service/src/pixushr/api/__init__.py`
- `service/src/pixushr/orchestrator/__init__.py`
- `service/tests/__init__.py`

- [ ] **Step 3: Install dependencies**

Run (from the `service/` directory):

```bash
cd service && uv sync
```

Expected: uv creates `.venv/` and `uv.lock`, installs FastAPI, uvicorn, pydantic, pytest, httpx. Output ends with a summary like `Installed N packages`.

- [ ] **Step 4: Verify the toolchain runs**

Run:

```bash
cd service && uv run python -c "import fastapi, pydantic; print('ok')"
```

Expected: prints `ok`.

- [ ] **Step 5: Add a service .gitignore entry and commit**

Append to the repo root `.gitignore` (create the lines if absent):

```gitignore
# Python service
service/.venv/
__pycache__/
*.pyc
.pytest_cache/
```

Then commit:

```bash
git add .gitignore service/pyproject.toml service/src/pixushr service/tests service/uv.lock
git commit -m "chore: scaffold python agent service (uv + fastapi)"
```

---

### Task 2: Health endpoint (TDD)

**Files:**
- Create: `service/src/pixushr/main.py`
- Test: `service/tests/test_health.py`

- [ ] **Step 1: Write the failing test**

Create `service/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from pixushr.main import app

client = TestClient(app)


def test_health_returns_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd service && uv run pytest tests/test_health.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'pixushr.main'` (or import error).

- [ ] **Step 3: Write the minimal implementation**

Create `service/src/pixushr/main.py`:

```python
from fastapi import FastAPI

app = FastAPI(title="PixushHR Agent Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd service && uv run pytest tests/test_health.py -v
```

Expected: PASS — `test_health_returns_ok PASSED`.

- [ ] **Step 5: Commit**

```bash
git add service/src/pixushr/main.py service/tests/test_health.py
git commit -m "feat: add /health endpoint"
```

---

### Task 3: Data contract — wire models + AgentReply envelope (TDD)

**Files:**
- Create: `service/src/pixushr/api/models.py`
- Test: `service/tests/test_models.py`

This is the single source of truth for the Sensei wire shapes and the internal envelope (spec §4.5). `AgentReply.to_execute_response()` is the Edge's projection: Sensei reads only `response`; the full envelope is mirrored into `structured` (reporting-only, never scored — spec §2).

- [ ] **Step 1: Write the failing test**

Create `service/tests/test_models.py`:

```python
from pixushr.api.models import (
    AgentReply,
    AuditedAction,
    ExecuteRequest,
    ExecuteResponse,
    UserRef,
)


def test_execute_request_defaults_context_to_empty_dict():
    req = ExecuteRequest(task="Onboard Maya")
    assert req.task == "Onboard Maya"
    assert req.context == {}


def test_agent_reply_projects_to_wire_response():
    reply = AgentReply(
        request_id="req-1",
        tenant="papaya",
        user=UserRef(id="u1", name="Maya", role="employee", channel="sensei"),
        response="Welcome, Maya!",
        actions=[AuditedAction(capability="hris.upsert_employee", target="u1", summary="created")],
    )
    wire = reply.to_execute_response()
    assert isinstance(wire, ExecuteResponse)
    # Sensei reads only `response`
    assert wire.response == "Welcome, Maya!"
    # full envelope mirrored into structured (reporting-only)
    assert wire.structured["tenant"] == "papaya"
    assert wire.structured["actions"][0]["capability"] == "hris.upsert_employee"


def test_user_ref_channel_defaults_to_sensei():
    user = UserRef(id="u1", name="Maya", role="employee")
    assert user.channel == "sensei"
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd service && uv run pytest tests/test_models.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'pixushr.api.models'`.

- [ ] **Step 3: Write the minimal implementation**

Create `service/src/pixushr/api/models.py`:

```python
from typing import Any, Literal

from pydantic import BaseModel, Field

Channel = Literal["sensei", "teams", "slack", "email"]


class ExecuteRequest(BaseModel):
    """Sensei wire request: POST /execute body."""

    task: str
    context: dict[str, Any] = Field(default_factory=dict)


class ExecuteResponse(BaseModel):
    """Sensei wire response. Sensei scores only `response`; `structured` is reporting-only."""

    response: str
    structured: dict[str, Any] | None = None


class UserRef(BaseModel):
    id: str
    name: str
    role: str
    channel: Channel = "sensei"


class AuditedAction(BaseModel):
    capability: str
    target: str
    summary: str


class AgentReply(BaseModel):
    """Internal agent->Edge envelope (spec §4.5)."""

    request_id: str
    tenant: str
    user: UserRef
    response: str
    actions: list[AuditedAction] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)

    def to_execute_response(self) -> ExecuteResponse:
        """Project the envelope to the Sensei wire shape."""
        return ExecuteResponse(response=self.response, structured=self.model_dump())
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd service && uv run pytest tests/test_models.py -v
```

Expected: PASS — all three tests pass.

- [ ] **Step 5: Commit**

```bash
git add service/src/pixushr/api/models.py service/tests/test_models.py
git commit -m "feat: add sensei wire models and AgentReply envelope"
```

---

### Task 4: Stub orchestrator (TDD)

**Files:**
- Create: `service/src/pixushr/orchestrator/stub.py`
- Test: `service/tests/test_stub.py`

The stub stands in for the real Hermes orchestrator (Plan 5). It returns a well-formed `AgentReply` so the contract and the rest of the service can be built/tested now. It reads `tenant` from `context` (defaulting to `papaya`) to exercise the multi-tenant seam.

- [ ] **Step 1: Write the failing test**

Create `service/tests/test_stub.py`:

```python
from pixushr.api.models import AgentReply, ExecuteRequest
from pixushr.orchestrator.stub import run_stub


def test_stub_returns_agent_reply_echoing_the_task():
    req = ExecuteRequest(task="Onboard Maya Cohen", context={"tenant": "papaya"})
    reply = run_stub(req)
    assert isinstance(reply, AgentReply)
    assert reply.tenant == "papaya"
    assert "Maya Cohen" in reply.response
    assert reply.request_id  # non-empty


def test_stub_defaults_tenant_when_absent():
    reply = run_stub(ExecuteRequest(task="hello"))
    assert reply.tenant == "papaya"
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd service && uv run pytest tests/test_stub.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'pixushr.orchestrator.stub'`.

- [ ] **Step 3: Write the minimal implementation**

Create `service/src/pixushr/orchestrator/stub.py`:

```python
import uuid

from pixushr.api.models import AgentReply, ExecuteRequest, UserRef


def run_stub(req: ExecuteRequest) -> AgentReply:
    """Placeholder orchestrator. Replaced by the Hermes-backed orchestrator in Plan 5."""
    tenant = req.context.get("tenant", "papaya")
    return AgentReply(
        request_id=str(uuid.uuid4()),
        tenant=tenant,
        user=UserRef(id="unknown", name="Employee", role="employee", channel="sensei"),
        response=f"[stub] Received task: {req.task}",
    )
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd service && uv run pytest tests/test_stub.py -v
```

Expected: PASS — both tests pass.

- [ ] **Step 5: Commit**

```bash
git add service/src/pixushr/orchestrator/stub.py service/tests/test_stub.py
git commit -m "feat: add stub orchestrator returning AgentReply"
```

---

### Task 5: Wire `/execute` to the Sensei contract (TDD)

**Files:**
- Modify: `service/src/pixushr/main.py`
- Test: `service/tests/test_execute.py`

- [ ] **Step 1: Write the failing test**

Create `service/tests/test_execute.py`:

```python
from fastapi.testclient import TestClient

from pixushr.main import app

client = TestClient(app)


def test_execute_returns_sensei_wire_shape():
    resp = client.post(
        "/execute",
        json={"task": "Onboard Maya Cohen", "context": {"tenant": "papaya"}},
    )
    assert resp.status_code == 200
    body = resp.json()
    # Sensei contract: response is a non-empty string
    assert isinstance(body["response"], str)
    assert "Maya Cohen" in body["response"]
    # structured present for our own reporting, carries the envelope
    assert body["structured"]["tenant"] == "papaya"


def test_execute_accepts_missing_context():
    resp = client.post("/execute", json={"task": "hello"})
    assert resp.status_code == 200
    assert isinstance(resp.json()["response"], str)
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd service && uv run pytest tests/test_execute.py -v
```

Expected: FAIL — `404 Not Found` (no `/execute` route yet), so the assertions fail.

- [ ] **Step 3: Add the `/execute` route**

Replace the entire contents of `service/src/pixushr/main.py` with:

```python
from fastapi import FastAPI

from pixushr.api.models import ExecuteRequest, ExecuteResponse
from pixushr.orchestrator.stub import run_stub

app = FastAPI(title="PixushHR Agent Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/execute", response_model=ExecuteResponse)
def execute(req: ExecuteRequest) -> ExecuteResponse:
    reply = run_stub(req)
    return reply.to_execute_response()
```

- [ ] **Step 4: Run the full test suite to verify everything passes**

Run:

```bash
cd service && uv run pytest -v
```

Expected: PASS — all tests across `test_health.py`, `test_models.py`, `test_stub.py`, `test_execute.py`.

- [ ] **Step 5: Commit**

```bash
git add service/src/pixushr/main.py service/tests/test_execute.py
git commit -m "feat: wire /execute to stub orchestrator (sensei contract)"
```

---

### Task 6: Manual smoke run + service README

**Files:**
- Create: `service/README.md`

- [ ] **Step 1: Start the server**

Run:

```bash
cd service && uv run uvicorn pixushr.main:app --port 3000
```

Expected: uvicorn logs `Uvicorn running on http://127.0.0.1:3000`.

- [ ] **Step 2: Hit the endpoints (in a second terminal)**

Run:

```bash
curl -s http://127.0.0.1:3000/health
curl -s -X POST http://127.0.0.1:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"task":"Onboard Maya Cohen","context":{"tenant":"papaya"}}'
```

Expected: first prints `{"status":"ok"}`; second prints a JSON object whose `response` contains `Maya Cohen` and whose `structured.tenant` is `papaya`. Then stop the server (Ctrl-C).

- [ ] **Step 3: Write the README**

Create `service/README.md`:

```markdown
# PixushHR Agent Service

Python (FastAPI) service implementing the Sensei HTTP contract for the PixushHR
onboarding/offboarding agent. See `docs/superpowers/specs/2026-06-11-architecture-design.md`.

## Endpoints
- `GET /health` → `{"status":"ok"}`
- `POST /execute` → accepts `{task, context}`, returns `{response, structured}`.
  Sensei scores only `response`; `structured` mirrors the internal envelope (reporting-only).

## Develop
```bash
cd service
uv sync                 # install deps
uv run pytest -v        # run tests
uv run uvicorn pixushr.main:app --port 3000   # run the service
```

## Status
The orchestrator is a **stub** (`orchestrator/stub.py`) — replaced by the Hermes-backed
orchestrator in a later plan. This plan locks the HTTP contract and the reply envelope.
```

- [ ] **Step 4: Commit**

```bash
git add service/README.md
git commit -m "docs: add agent service README"
```

---

## Done criteria

- `cd service && uv run pytest -v` is green (health, models, stub, execute).
- The service runs and answers `/health` and `/execute` with the Sensei wire shape.
- The data contract (`api/models.py`) and the orchestrator boundary (`orchestrator/stub.py`) are in place for later plans to build on.
