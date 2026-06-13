# Design System — PixushHR Dashboard

**Captured from Claude Design and vendored into the app.**

- **Tokens + components live in** `dashboard/src/ui/` (`tokens/*.css`, `styles.css`, `components/`,
  barrel `index.ts`). Import `dashboard/src/ui/styles.css` once globally; components use Tailwind
  utilities that reference the CSS-var tokens.
- **Full token/component manifest:** `docs/design/reference/_ds_manifest.json`.
- **Guidelines (voice, color, type, spacing, a11y, "how to build"):** `component-guidelines.md`.
- **Visual reference (full UI kit):** `docs/design/reference/ui_kits/pixushr/index.html`.

Stack: React + TypeScript + **Tailwind v3.4** + CSS-variable tokens + **lucide-react** icons +
Plus Jakarta Sans / JetBrains Mono. Dark left-nav, light content, papaya (`#f55d0f`) accent.

Note: the vendored `.d.ts` files were completed with `export declare function` signatures and
`CodeViewer.jsx` got an explicit `import React` so the components are consumable from TypeScript.
