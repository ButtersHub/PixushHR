---
name: hris-tool
description: Execute a PixushHR domain tool (e.g. hris.upsert_employee) by calling the engine.
---

Use this skill to run a domain tool against the HR system. Provide the tool `name` and its
`args` as JSON. Example: name="hris.upsert_employee", args={"tenant":"papaya","id":"e1",
"name":"Maya Cohen","role":"Engineer","startDate":"2026-07-01"}.

Run: `bash run.sh '<name>' '<args-json>'` — it returns the tool result JSON.
