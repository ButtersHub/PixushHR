from pixushr.api.models import AgentReply, ExecuteRequest
from pixushr.orchestrator.stub import run_stub


def test_stub_returns_agent_reply_echoing_the_task():
    req = ExecuteRequest(task="Onboard Maya Cohen", context={"tenant": "papaya"})
    reply = run_stub(req)
    assert isinstance(reply, AgentReply)
    assert reply.tenant == "papaya"
    assert "Maya Cohen" in reply.response
    assert reply.request_id


def test_stub_defaults_tenant_when_absent():
    reply = run_stub(ExecuteRequest(task="hello"))
    assert reply.tenant == "papaya"
