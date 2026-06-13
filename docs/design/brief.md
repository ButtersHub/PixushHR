# Design Brief — PixushHR Dashboard

> Paste or attach this whole file into Claude Design as the project context before running the
> prompts in `claude-design-prompts.md`. It is distilled from spec §11 (UX brief) and §12
> (design-system brief).

## Product
**PixushHR** is an autonomous HR **onboarding & offboarding** agent for Papaya Global. The
**dashboard** is a single-operator console used to (a) **configure** the system and (b) **show**
the agent working during a live demo — turning an invisible HTTP agent into something watchable
and stage-driveable. It talks to a backend "engine" over HTTP.

## Audience & tone
- **Audience:** one operator / the person presenting the demo (technical, but on stage).
- **Aesthetic:** a calm, trustworthy **operations console** with the warmth of a modern
  **fintech/HR brand** (Papaya). Professional, legible, confident — *not* flashy or playful.
- **Accessibility is a first-class requirement** (not a polish step): WCAG AA contrast, full
  keyboard navigation (especially the flow editor), visible focus states, ARIA for the dynamic
  trace + toggles, reduced-motion support.

## Brand direction (adjust if real Papaya brand assets are provided)
- Warm **primary/accent** in the coral/amber family (a nod to "papaya"), on a clean neutral base.
- Clear semantic colors: success / info / warning / danger.
- **Status colors** are load-bearing in this product: `mock` vs `real` vs `off` (integration
  modes) and `health` (ok/warn/down) — give them a consistent, distinct treatment.
- A **monospace** type family is required for the live trace, tool-call args/results, and binding
  pills.

## Implementation target (so generated code is liftable)
- **React + TypeScript**, styled with **Tailwind CSS**, **design tokens as CSS variables**
  (themeable; supports a future dark mode). Prefer **accessible headless primitives** (e.g. Radix)
  under the hood for menus/dialogs/tabs/toggles.
- Components ship as one shared module (`dashboard/src/ui/`) that every screen imports.

## Information architecture (the screens)
- **Top bar (global):** tenant selector · **Trigger scenario** · **Reset** · live toggles
  (`infra: Hermes|OpenClaw`, `integrations: mock|real`, `MEMORY_MODE`, `ENCRYPTION_AT_REST`).
- **Left nav, split into Show / Configure.**
- **Show:** **Live Run** (trace: intent → tool calls → output envelope; states idle/running/
  complete/escalated/error) · **Messages** (agent messages by recipient/channel; tone + audience-
  scoping visible) · **Audit log** (append-only, filterable table).
- **Configure:** **Users & roles** · **Synthetic data** (fixtures + reset + pick scenario) ·
  **Integrations** (two tabs: **Catalog** = connectors grouped by type with install state;
  **Installed** = per-connector General / Mock config / Prod config / Data / Tools) · **Workflow
  editor** (visual Trigger·Action·Condition flow with nested branches + an inspector for field
  bindings: literal / data-ref / agent-filled).
- **Minimal current state (already built):** a single page — task input → **Trigger** → response
  + audit list. Design this too; it's the starting point for implementation.

## Required component inventory (minimum)
- **Layout:** app shell · top bar · split nav · tabbed panel · side inspector.
- **Data:** tables (sortable/filterable) · cards · badges/pills · **status dots** · key-value rows
  · code/JSON viewer.
- **Inputs:** buttons (primary/secondary/danger) · toggle/switch · select · text/number input ·
  search · confirm dialog.
- **Feedback:** toasts · empty / loading / error / **streaming** states.
- **Domain-specific:** flow-canvas **nodes** (trigger / action / condition / escalate) · branch
  connectors · **binding pill** (literal / ref / agent) · live-trace row · message bubble ·
  catalog **connector card**.
- Every interactive component must define: default / hover / focus / active / disabled / loading /
  error.

## Deliverable #4 (confirmed): States & accessibility checklist
A **per-component checklist** the implementer ticks before shipping any component — every required
state (default/hover/focus/active/disabled/loading/error) plus the accessibility requirements
(contrast, keyboard, focus, ARIA, reduced-motion). Produced as part of Prompt 3 and captured in
`component-guidelines.md`.
