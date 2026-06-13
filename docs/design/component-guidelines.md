# PixushHR Design System

> **Operations Console Design System for Papaya Global**
> An autonomous HR onboarding & offboarding agent dashboard — calm, trustworthy, warm.

## Source Materials

This design system was built from the following sources:

- **Local codebase:** `PixushHR/` (mounted via File System Access API)
  - `PixushHR/dashboard/` — React/Vite dashboard (the product this system serves)
  - `PixushHR/engine/` — TypeScript/Fastify backend engine
  - `PixushHR/docs/design/` — Design brief, screen specs, component guidelines
  - `PixushHR/requirements/` — Job definition, architecture decisions, office hour notes
- **GitHub repo:** `ButtersHub/PixushHR` — https://github.com/ButtersHub/PixushHR
  *(Explore for deeper implementation context; the design system was derived from the local mount)*

## About the Product

**PixushHR** is an autonomous HR onboarding & offboarding operations agent for **Papaya Global** (a fintech/HR company), built for the Agentalent.ai "Big Agents Competition." The dashboard is a single-operator console used to:
- **Configure** the system (integrations, users, workflows, synthetic data)
- **Show** the agent working during a live demo — trigger a scenario and watch the agent reason, call tools, and produce warm, empathetic communications

The agent is warm, professional, and empathetic. It orchestrates actions across Shapes (HRIS), Comeet (ATS), Microsoft Teams, email, and Calendar — all logged and auditable.

### Architecture
```
Engine (TS/Fastify) ←→ Agent (Hermes/Python) ←→ Dashboard (React/Vite)
     /execute + /audit     OpenAI-compatible API       this UI
```

---

## CONTENT FUNDAMENTALS

### Voice & Tone
- **Warm but professional.** Not cold or robotic. Not playful or casual. Papaya's agent speaks like a thoughtful HR colleague — empathetic, clear, respectful.
- **First person singular**: "I've updated Maya's record in Shapes." Not "The system updated…"
- **Active voice**: "I sent the welcome email." Not "The welcome email was sent."
- **Acknowledge the human moment**: Onboarding and offboarding are high-stakes for real people. The copy reflects this: "Welcome to Papaya, Maya — it's genuinely great to have you joining us."
- **No dismissal**: Never ignore a question. If uncertain, escalate warmly: "I want to make sure this is handled correctly, so I'm flagging it for the HR team."
- **Data is factual, tone is warm**: Numbers, dates, and statuses are stated precisely. Warmth lives in the framing and transitions, not by hedging facts.
- **No emoji** in agent communications or UI. Clean, professional.
- **Casing**: Sentence case for body copy, labels, and tooltips. Title Case only for proper names (Papaya, Shapes, Comeet) and nav section headings. ALL-CAPS only for status badges (MOCK, REAL, OFF).
- **Error messages**: Never blame the user. Describe what happened and what to do: "Couldn't reach Shapes — check the connection in Integrations and try again."

### Copy Examples
- Button: "Trigger scenario" not "Run" or "Execute"
- Empty state: "No messages yet. Run a scenario to see agent communications here."
- Loading: "Running…" (with ellipsis, no "Please wait")
- Success toast: "Scenario complete — view the trace for details."
- Danger confirm: "This will reset all synthetic data and cannot be undone."
- Status: "Mock · Shapes" not "Shapes: mock mode"

---

## VISUAL FOUNDATIONS

### Brand Identity
PixushHR is the ops console for Papaya Global — a fintech/HR company whose name evokes the papaya fruit: warm, orange-golden, tropical but professional. The dashboard should feel like a **calm control room with a heartbeat** — operational density without anxiety.

### Color
- **Primary palette**: Coral-orange (`--papaya-500: #f55d0f`) — warm, distinctive, not aggressive. Used for primary CTAs, active nav states, focus rings, and accent highlights.
- **Neutral base**: Warm-tinted gray (slightly beige undertone, not cool blue-gray). App background `#faf9f7`, cards `#ffffff`, nav `#26231f` (near-black warm).
- **Status colors are load-bearing**: `mock` = indigo (simulated/safe), `real` = emerald (live/production), `off` = gray (inactive). Health: `ok` = green, `warn` = amber, `down` = red.
- **No decorative gradients**. Flat surfaces. Color is used functionally, not decoratively.
- **Dark mode**: All tokens are dual-mapped; dark mode inverts the neutral ramp while keeping the papaya accent at readable contrast.

### Typography
- **Plus Jakarta Sans** — display, headings, body. Warm, contemporary, high-legibility at dense info-panel sizes. Not overused (avoids Inter).
- **JetBrains Mono** — all code, traces, tool-call args/results, binding pills, JSON viewer. Clear distinction between prose and machine output.
- **Scale is conservative**: Body default is 13px (dense console UI). Headings rarely exceed 24px in the app shell. The overview/display scale (30–36px) is reserved for the design system specimen only.
- **Letter spacing**: Headings use `--ls-snug` (-0.015em) for a tighter, more editorial feel. Labels use `--ls-caps` (0.08em) for uppercase readability.

### Spacing
- **4px base unit**. Dense but breathable. Panels use 16–24px padding. Table rows are 36–40px tall.
- **No large decorative whitespace**: This is an ops console, not a marketing page.

### Backgrounds & Surfaces
- **Three surface levels**: app bg (`#faf9f7`), card (`#ffffff`), sunken (`#f4f2ef`).
- **No background images, illustrations, or textures** in the app UI. Clean surfaces only.
- **Left nav is dark** (`#26231f`) — creates clear visual separation from the light content area.
- **Cards use `--shadow-sm`** — subtle, not heavy. No colored borders.

### Borders & Radius
- **Radius**: `6px` default (inputs, cards, badges). `3px` for tight controls. `9999px` for pills and status dots.
- **Borders**: Always `--border-default` (`#e8e5e0`). No colored or gradient borders except focus rings.

### Shadows & Elevation
- **Minimal shadow**. Cards: `--shadow-sm`. Dropdowns/popovers: `--shadow-md`. Modals: `--shadow-xl`. Nav and top bar: no shadow (rely on `border-bottom` and background contrast instead).
- **Focus rings**: 4px papaya ring — highly visible, never suppressed.

### Animation & Motion
- **Subtle and purposeful**. Default transition: 150ms `ease-standard`. Hover states: 100ms. No bounce or spring for business-critical interactions (only minor spring on small decorative elements).
- **Streaming states** use a gentle pulse (`--duration-loading: 1200ms`) for skeleton screens.
- **All motion respects `prefers-reduced-motion`** — duration tokens collapse to 0ms.

### Hover & Press States
- **Hover**: Background lightens/darkens by one step on the neutral ramp. No opacity change.
- **Press/Active**: Background deepens one more step. Slight shadow inset on buttons.
- **Nav hover**: `--surface-nav-hover` (`#3d3a36`). Active: papaya left-border indicator (3px solid `--papaya-500`).

### Iconography
- **Lucide icons** (CDN: `https://unpkg.com/lucide@latest`). Stroke weight 1.5px. 16px default, 20px for nav/header icons.
- **No emoji** in the product UI.
- **No custom icon font** in the current codebase; Lucide is the standard.
- Status dots and health indicators use filled circles (SVG), not icon fonts.

### Cards
- White background, `border-radius: var(--radius-md)`, `border: 1px solid var(--border-default)`, `box-shadow: var(--shadow-sm)`.
- No colored left-border accents (avoid the AI slop pattern).
- Content density: 16px padding for standard cards, 12px for compact table-adjacent cards.

### Imagery
- **No decorative photography** in the UI.
- **Hero asset** (`assets/hero.png`) is available for marketing/overview contexts only.

---

## File Index

```
styles.css                    ← Global CSS entry point (consumers import this)
tokens/
  colors.css                  ← Full color scale: papaya, neutral, semantic, status, health
  typography.css              ← Font families, scale, weights, semantic text styles
  spacing.css                 ← Space scale, layout constants, border radii
  elevation.css               ← Shadow scale, focus rings
  motion.css                  ← Duration, easing, transition shorthands
  base.css                    ← Reset, :focus-visible, utilities

assets/
  hero.png                    ← Brand hero image (marketing contexts)

components/
  core/                       ← Button, Input, Select, Toggle, Badge, StatusDot, Card, Toast
  data/                       ← Table, CodeViewer, KeyValueRow
  feedback/                   ← EmptyState, LoadingState, ErrorState, StreamingState
  domain/                     ← FlowNode, BindingPill, TraceRow, MessageBubble, ConnectorCard

guidelines/                   ← Foundation specimen cards (Design System tab)

ui_kits/
  pixushr/                    ← Full PixushHR dashboard (interactive, all screens)

templates/
  dashboard/                  ← Starting-point template for consuming projects

README.md                     ← This file
SKILL.md                      ← Agent skill descriptor
```

### Components

| Component | Group | Description |
|---|---|---|
| `Button` | Core | Primary / Secondary / Danger / Ghost — all states |
| `Input` | Core | Text, number, search — all states |
| `Select` | Core | Dropdown select with custom styling |
| `Toggle` | Core | Switch/toggle with ARIA |
| `Badge` | Core | Status badges and pills |
| `StatusDot` | Core | Integration mode + health indicators |
| `Card` | Core | Content card container |
| `Toast` | Core | Feedback notifications |
| `Table` | Data | Sortable, filterable data table |
| `CodeViewer` | Data | Syntax-aware JSON/code viewer |
| `KeyValueRow` | Data | Key → value display row |
| `EmptyState` | Feedback | Placeholder for empty lists/panels |
| `LoadingState` | Feedback | Skeleton and spinner states |
| `ErrorState` | Feedback | Error messaging with action |
| `StreamingState` | Feedback | Live streaming / agent running |
| `FlowNode` | Domain | Trigger / Action / Condition / Escalate canvas nodes |
| `BindingPill` | Domain | Literal / data-ref / agent-filled binding chips |
| `TraceRow` | Domain | Live agent trace step |
| `MessageBubble` | Domain | Agent/employee message display |
| `ConnectorCard` | Domain | Integration catalog card |

### UI Kits

| Kit | Path | Description |
|---|---|---|
| PixushHR Dashboard | `ui_kits/pixushr/` | Full interactive console: trigger, live run, messages, audit, integrations, workflow editor |

---

*Generated by Claude Design · June 2026*
*Sources: local `PixushHR/` codebase · GitHub `ButtersHub/PixushHR`*
