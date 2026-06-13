# Widening Roadmap — lean slice → requirements-complete demo

**Where we are:** working two-service base (engine + Hermes agent + dashboard + Langfuse), deployed
on AWS, but only ONE tool (`hris.upsert_employee`), in-memory, no real workflows. **Do NOT point
Sensei until our own self-test (Phase C) passes.**

Order matters. Each phase is its own plan → implement (subagent-driven) → verify → merge.

## Phase A — Onboarding as a REAL multi-step workflow (the headline)
1. **Capability tools + mock integrations over synthetic data** (decisions #13–15, #44): add
   `ats.get_contract`, `channel.send_message` (capture the message text for the dashboard),
   `calendar.create_invite`, `teams.add_member`, `content.get_branding` (+ `hris.upsert_employee`
   exists). Role-named ports + in-memory mock adapters; seed synthetic employees / signed
   contracts / hiring managers / branding content.
2. **Onboarding `WorkflowDefinition`** (typed Trigger·Action·Condition, decisions #19, #46) + the
   **NL playbook serializer** injected to the agent (decision #30): extract contract → collect from
   hiring manager → populate Shapes → add to Teams → welcome + branding → answer questions.
3. Verify: one `/execute` runs the full sequence; Langfuse trace shows multiple tool calls;
   messages + audit populated.

## Phase B — Offboarding + confidentiality gate + escalation
4. **Offboarding workflow:** pre-offboarding email → termination fields (date/reason/status) →
   **scoped** last-day calendar invite → activate → termination letter **or escalate**.
5. **Structural confidentiality gate** (decision #46): the invite tool accepts only logistics —
   **no `reason` parameter**; the reason flows only to the termination-letter tool
   (employee/authorized HR). Add the `escalate` capability + terminal states (decision #40).

## Phase C — Self-grade with OUR Sensei suite (the requirements gate)
6. Author the **requirements-traceable** suite (decision #32): execution / reasoning /
   self-improvement layers + adversarial traps (confidentiality leak, missing-info→escalate,
   hallucination bait, out-of-bounds question). Independent judge model.
7. `sensei run --suite … --target http://<host>:3000/execute` → score/badge. Iterate to gold-ish.
   **This is the gate that means "meets the requirements."**

## Phase D — Demo polish (dashboard, on the design system)
8. Implement the placeholder screens: **Messages** (warm comms + audience-scoping visible),
   **Audit** (proper table), a **Live Run trace** view; make the top-bar toggles functional
   (mock/real). Shows the agent working across systems for the live demo.

## Phase E — Submit
9. Point Sensei/Agentalent at `http://<host>:3000/execute` once the self-test passes.

## Deferred (NOT demo-blocking)
WhatsApp bridge · DynamoDB/S3 (replace in-memory) · encryption (EBS/KMS) + Secrets Manager ·
reverse proxy + TLS · populate `structured.actions[]` · Langfuse span nesting/cost verify.

**Recommended first step: Phase A.** Start a fresh session with: "read docs/STATUS.md and
docs/superpowers/plans/2026-06-13-widening-roadmap.md, then write the Phase A plan."
