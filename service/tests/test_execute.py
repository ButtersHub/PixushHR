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
    assert isinstance(body["response"], str)
    assert "Maya Cohen" in body["response"]
    assert body["structured"]["tenant"] == "papaya"


def test_execute_accepts_missing_context():
    resp = client.post("/execute", json={"task": "hello"})
    assert resp.status_code == 200
    assert isinstance(resp.json()["response"], str)


def test_execute_rejects_missing_task():
    resp = client.post("/execute", json={"context": {}})
    assert resp.status_code == 422
