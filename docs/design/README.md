# PixushHR — Dashboard Design System

This folder is the **source of truth** for the dashboard's visual design. We use
**[Claude Design](https://claude.ai/design/)** to generate the system + screens, then capture the
results back here so any future AI (or human) implements against a single, documented baseline.

## Workflow

```
1. brief.md                 ── the context you paste/attach into Claude Design
2. claude-design-prompts.md ── run these 3 prompts, in order, iterating in Claude Design
        │
        ├─▶ design-system.md         (tokens + components — captured from Claude Design)
        ├─▶ screens.md               (screen designs — captured / linked)
        └─▶ component-guidelines.md  (written rules for future implementers)
3. (later) implement: shared UI package → dashboard rebuilt on it
```

### Steps
1. Open `brief.md`. Paste (or attach) it into Claude Design as the project context.
2. Run **Prompt 1 (Design system)** from `claude-design-prompts.md`. Iterate until the tokens +
   components feel right. **Export the React + Tailwind code + tokens** and paste the definitions
   into `design-system.md`.
3. Run **Prompt 2 (Screens)**. Capture the screen designs (images/links + notes) into `screens.md`.
4. Run **Prompt 3 (Guidelines)**. Paste the result into `component-guidelines.md` — this is what
   future AI reads before building any new component.

### Definition deliverables (this folder)
1. **Design system** — `design-system.md` (tokens + component inventory with states).
2. **Screen designs** — `screens.md` (all screens, composed from the system).
3. **Component guidelines** — `component-guidelines.md` (rules for future implementers).
4. **States & accessibility checklist** — a per-component checklist (in `component-guidelines.md`).

### Implementation deliverables (later, separate branch)
1. **Shared UI package** — `dashboard/src/ui/` (tokens + components as React/TS, used everywhere).
2. **Dashboard rebuilt** on the shared UI, screen by screen (start with what the lean slice has:
   task input → response → audit; then widen per `screens.md`).

## Inputs already in the repo
- Dashboard information architecture & screens: **spec §11** (`docs/superpowers/specs/2026-06-11-architecture-design.md`).
- Design-system requirements (tokens, component inventory, accessibility): **spec §12**.
- What's built today (the minimal dashboard): `dashboard/src/App.tsx`.
