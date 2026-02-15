# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Microsoft Entra ID Conditional Access policy simulator. Pure TypeScript evaluation engine with React visualization. Evaluates sign-in scenarios against CA policies with four visualization modes (Grid, Matrix, Sankey Flow, Gaps) and automated gap analysis. Supports both sample data (13 demo policies, 5 personas) and live tenant connection via MSAL + Microsoft Graph API.

## Commands

```bash
npm run dev          # Vite dev server on http://localhost:5173
npm run build        # Production build to dist/
npm test             # Run all engine tests (Vitest)
npm run test:watch   # Watch mode
```

Run a single test file:
```bash
npx vitest run src/engine/__tests__/conditions/UserConditionMatcher.test.ts
```

## Architecture

Three strictly separated layers:

```
Visualization Layer    React 18 + Shadcn/UI + D3 + Zustand stores
Data Layer             MSAL auth, Graph API fetch, GUID resolution, normalization
Engine Layer           Pure TypeScript, zero browser dependencies, fully testable
```

### Engine Layer (`src/engine/`)

Stateless, deterministic evaluation pipeline. Same inputs always produce same outputs. No DOM, no fetch, no React imports.

**4-phase pipeline:** Signal Collection → Policy Matching → Grant Resolution → Session Control Aggregation

- `CAEngine.ts` — Main orchestrator
- `PolicyEvaluator.ts` — Single-policy evaluation (conditions AND'd, short-circuits on first failure)
- `GrantControlResolver.ts` — Cross-policy grant resolution (always AND across policies)
- `SessionControlAggregator.ts` — Most-restrictive-wins session control merging
- `authenticationStrength.ts` — Hierarchy resolution for built-in authentication strengths (MFA < Passwordless MFA < Phishing-resistant MFA). Higher tiers satisfy lower requirements; custom strengths are never satisfied.
- `conditions/` — 8 matchers: User, Application, DevicePlatform, Location, ClientApp, RiskLevel, DeviceFilter, AuthenticationFlow

**Data models** in `src/engine/models/` mirror `microsoft.graph.conditionalAccessPolicy` schema exactly. The Data Layer normalizes Graph API responses into these types — the engine never sees raw API data.

### Key Engine Rules

- **Exclusion always wins over inclusion.** User in both included group AND excluded group → excluded.
- **Unconfigured conditions match everything.** Missing platform condition = matches all platforms.
- **Grant resolution is per-policy then cross-policy AND.** Each policy's OR/AND operator applies within, then ALL policies must be independently satisfied. Never aggregate controls across policies.
- **Block in any policy → always block.**
- **No matching enabled policies → implicit allow.**
- **Report-only policies** go through the full pipeline but never affect the final decision.
- **Authentication strength is hierarchy-based.** Built-in strengths have levels: MFA (1) < Passwordless MFA (2) < Phishing-resistant MFA (3). A user at level N satisfies any requirement at level ≤ N. Custom/unknown strengths are never satisfied. The `authenticationStrengthLevel` field on `SimulationContext` drives this resolution.
- **roleTemplateId, not id** — Directory role matching must use `roleTemplateId` from Graph API, not the role instance `id`.

### State Management (`src/stores/`)

Three independent Zustand stores (no circular dependencies):
- `usePolicyStore` — Policies, named locations, display names, data source (`'none' | 'live' | 'sample'`)
- `useEvaluationStore` — Engine results, active view, selected policy, singleton CAEngine instance
- `usePersonaStore` — Persona resolution cache, user search

Auth handled by MSAL's `MsalProvider` + `useMsal()` hook (no separate store). Scenario form state is local `useState` in `ScenarioPanel`.

### Visualization (`src/components/`)

- **Grid** (`PolicyGraph.tsx`) — CSS Grid tiles, color-coded by inferred category
- **Matrix** (`matrix/EvaluationMatrix.tsx`) — Diagnostic heatmap, conditions as columns, knockout highlighting
- **Flow** (`sankey/SankeyFunnel.tsx`) — D3 Sankey diagram, 6 evaluation stages
- **Gaps** (`GapsView.tsx`) — Brute-force coverage gap analysis across all scenario combinations

### Data Layer (`src/services/`)

- `graphService.ts` — Single translation point from raw Graph API → engine models. Handles pagination, batch GUID resolution, named location fetching.
- `personaService.ts` — User search + transitive group/role membership resolution
- `auth.ts` — MSAL instance creation + token acquisition

## Key Conventions

- **Shadcn/UI for all standard UI elements.** Custom CSS only for D3 canvas and layout concerns.
- **Dark theme only.** Colors from `src/data/theme.ts` (`COLORS` object) — single source of truth.
- **Lucide React for icons.** No emojis in code.
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin (no tailwind.config.js or postcss.config.js). Theme variables in `@theme inline` blocks in `index.css`.
- **D3 isolation** — D3 manages its own SVG internals, React owns everything outside. Deep-copy data before passing to d3-sankey layout (it mutates inputs).
- **Path alias:** `@/` maps to `src/`
- **TypeScript strict mode** throughout. No `any` types.
- **Dual mode:** Sample vs live data distinguished by `dataSource` in policy store. Engine is mode-agnostic.
- **App bundles** (`src/data/appBundles.ts`) — Office365 and MicrosoftAdminPortals expand to individual app GUIDs for matching.

## Testing

All 370 tests are in `src/engine/__tests__/`. Tests cover each condition matcher, policy evaluator, grant resolver, session aggregator, authentication strength hierarchy, full engine integration, and gap analysis. Tests use real policy structures and contexts — no mocking of the engine.

## Environment

Copy `.env.example` to `.env` and set `VITE_MSAL_CLIENT_ID` for live tenant connection. Sample mode works without any configuration.
