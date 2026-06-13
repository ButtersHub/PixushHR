# Claude Design Prompts — PixushHR Dashboard

Run these **in order** in [Claude Design](https://claude.ai/design/). **First, paste/attach
`brief.md`** as the project context (each prompt also restates the essentials so it works even
standalone). Iterate within each step before moving on. When happy, **export the generated
React + Tailwind code + tokens** and capture them into `design-system.md` / `screens.md` /
`component-guidelines.md`.

> Tip: ask Claude Design to output **actual React + TypeScript + Tailwind component code and a
> token file (CSS variables + a Tailwind theme)** — not just images — so we can lift it directly
> into `dashboard/src/ui/`.

---

## Prompt 1 — Design system

```
You are creating the design system for "PixushHR" — an operations console for an HR
onboarding/offboarding AI agent (think: a calm, trustworthy control panel for a modern fintech/HR
brand called Papaya, with a touch of warmth). Accessibility is a first-class requirement
(WCAG AA contrast, full keyboard nav, visible focus, ARIA, reduced-motion).

Target implementation: React + TypeScript + Tailwind CSS, with design tokens as CSS variables
(themeable, dark-mode-ready), using accessible headless primitives (Radix) under the hood.

Deliver, as code I can implement:

1. Design TOKENS — output as CSS variables AND a Tailwind theme config:
   - color: neutral ramp; a warm primary/accent (coral/amber — a nod to "papaya"); semantic
     success / info / warning / danger; and STATUS colors for: mock, real, off (integration
     modes) and health (ok / warn / down).
   - typography: a display/heading/body scale + a MONOSPACE family (for code, traces, bindings);
     weights, sizes, line-heights.
   - spacing scale, border radii, elevation/shadows, motion durations + easings.

2. Core COMPONENTS as React+TS+Tailwind, each with ALL states (default / hover / focus / active /
   disabled / loading / error):
   - layout: app shell, top bar, split left-nav, tabbed panel, side inspector
   - inputs: button (primary/secondary/danger), toggle/switch, select, text & number input,
     search, confirm dialog
   - data: table (sortable/filterable), card, badge/pill, status dot, key-value row, code/JSON
     viewer
   - feedback: toast, and empty / loading / error / streaming states

3. Domain COMPONENTS:
   - flow-canvas nodes (4 variants: trigger, action, condition, escalate) + branch connectors
   - binding pill (3 variants: literal, data-ref, agent-filled)
   - live-trace row, message bubble, catalog connector card

Finish with ONE overview screen that renders the palette, the type scale, and every component in
its states, so I can review the whole system at a glance. Keep it cohesive, legible, accessible,
and implementable.
```

---

## Prompt 2 — Screens (compose from the system)

```
Using the design system from the previous step (same tokens + components — do not invent new
styles), design the following dashboard screens for PixushHR. Show realistic content, and the
empty / loading / error states for each.

Global layout: a persistent TOP BAR (tenant selector · "Trigger scenario" · "Reset" · live
toggles: infra Hermes|OpenClaw, integrations mock|real, MEMORY_MODE, ENCRYPTION_AT_REST) + a LEFT
NAV split into two groups, "Show" and "Configure" + a tab-driven main area.

Show:
- Live Run — a live trace of one request: intent classification → each tool call (args + result,
  success/error) → the final output envelope. Sub-tabs: Trace / Tool calls / Output envelope.
  States: idle, running (streaming), complete, escalated, error.
- Messages — every message the agent produced, grouped by recipient/channel; make the warm tone
  visible, and show that a message to a restricted audience omits sensitive fields (e.g. an
  offboarding invite that does NOT include the termination reason).
- Audit log — an append-only, filterable table: timestamp, actor, capability, target, summary.

Configure:
- Users & roles — view/seed a tenant + users (id, name, role, preferred channel).
- Synthetic data — view/seed/reset fixture datasets; choose which scenario to run.
- Integrations — TWO top tabs:
    • Catalog: connectors grouped by type (HRIS, ATS/Recruitment, Communication Channels, Task
      Board, Calendar, Content), each a card with icon, name, short description, install state.
    • Installed: per-connector detail with tabs General / Mock config / Prod config / Data / Tools.
- Workflow editor — a visual Trigger·Action·Condition flow builder: pick a trigger at the top,
  add steps below; conditions branch into THEN/ELSE (support NESTED branches, collapse/expand);
  a side inspector edits each field's binding (literal / data-ref / agent-filled).

Also design the MINIMAL current state (what's built today): a single page with a task input → a
"Trigger" button → a Response panel + an Audit list. This is the implementation starting point.
```

---

## Prompt 3 — Written guidelines for future implementers

```
Write component & design GUIDELINES for any future AI (or developer) implementing new UI in
PixushHR's dashboard, based on the design system + screens above. Output as clean Markdown I can
commit as the source of truth. Cover:

- Design principles and the intended feel (calm, trustworthy ops console + Papaya warmth;
  accessibility first).
- When to use each component, with do / don't examples.
- Token rules: never hardcode color/spacing/radius/shadow — always use tokens; how theming works.
- Layout, density, and spacing rules; how to compose a screen from components.
- The states every interactive component MUST handle (default/hover/focus/active/disabled/
  loading/error) and how to implement them.
- An accessibility checklist: contrast targets, keyboard interaction, focus management, ARIA for
  the dynamic trace + toggles, reduced-motion.
- HOW TO ADD A NEW COMPONENT to the system: naming, which tokens to use, required states, a11y
  requirements, and where it lives in code (`dashboard/src/ui/`).
- The implementation target: React + TypeScript + Tailwind, tokens as CSS variables, shipped as a
  shared `ui/` module that all screens import. Include a short "PR checklist" a future
  implementer runs before adding a component.
```
