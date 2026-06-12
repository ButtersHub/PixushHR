import { useState } from "react";

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? "http://localhost:3000";

interface AuditEntry { ts: string; capability: string; target: string; summary: string }

export default function App() {
  const [task, setTask] = useState("Onboard Maya Cohen (id e1, Engineer, start 2026-07-01)");
  const [response, setResponse] = useState("");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(false);

  async function trigger() {
    setBusy(true);
    try {
      const r = await fetch(`${ENGINE}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, context: { tenant: "papaya" } }),
      });
      const body = await r.json();
      setResponse(body.response ?? "");
      const a = await fetch(`${ENGINE}/audit?tenant=papaya`);
      setAudit(await a.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 760, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>PixushHR — Lean Slice</h1>
      <textarea value={task} onChange={(e) => setTask(e.target.value)} rows={3} style={{ width: "100%" }} />
      <button onClick={trigger} disabled={busy} style={{ marginTop: 8 }}>
        {busy ? "Running…" : "Trigger /execute"}
      </button>

      <h2>Response</h2>
      <pre style={{ whiteSpace: "pre-wrap", background: "#f5f5f5", padding: 12 }}>{response}</pre>

      <h2>Audit ({audit.length})</h2>
      <ul>
        {audit.map((e, i) => (
          <li key={i}><code>{e.capability}</code> → {e.target}: {e.summary} <small>({e.ts})</small></li>
        ))}
      </ul>
    </main>
  );
}
