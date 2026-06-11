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
    assert wire.response == "Welcome, Maya!"
    assert wire.structured["tenant"] == "papaya"
    assert wire.structured["actions"][0]["capability"] == "hris.upsert_employee"


def test_user_ref_channel_defaults_to_sensei():
    user = UserRef(id="u1", name="Maya", role="employee")
    assert user.channel == "sensei"
