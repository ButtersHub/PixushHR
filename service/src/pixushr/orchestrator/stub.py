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
