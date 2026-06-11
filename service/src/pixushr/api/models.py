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
    """Internal agent->Edge envelope (spec section 4.5)."""

    request_id: str
    tenant: str
    user: UserRef
    response: str
    actions: list[AuditedAction] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)

    def to_execute_response(self) -> ExecuteResponse:
        """Project the envelope to the Sensei wire shape."""
        return ExecuteResponse(response=self.response, structured=self.model_dump())
