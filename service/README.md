# PixushHR Agent Service

Python (FastAPI) service implementing the Sensei HTTP contract for the PixushHR
onboarding/offboarding agent. See `docs/superpowers/specs/2026-06-11-architecture-design.md`.

## Endpoints
- `GET /health` -> `{"status":"ok"}`
- `POST /execute` -> accepts `{task, context}`, returns `{response, structured}`.
  Sensei scores only `response`; `structured` mirrors the internal envelope (reporting-only).

## Develop
```bash
cd service
uv sync                 # install deps
uv run pytest -v        # run tests
uv run uvicorn pixushr.main:app --port 3000   # run the service
```

## Status
The orchestrator is a **stub** (`orchestrator/stub.py`) -- replaced by the Hermes-backed
orchestrator in a later plan. This plan locks the HTTP contract and the reply envelope.
