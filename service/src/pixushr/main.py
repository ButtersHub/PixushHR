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
