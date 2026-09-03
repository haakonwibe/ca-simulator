# CLAUDE.md — Project Instructions for Claude Code

## Project Overview

Microsoft Entra ID Conditional Access policy simulator. TypeScript engine + React visualization. Connects to real tenants via MSAL + Graph API or runs in demo mode with sample data.

## Tech Stack

- **Language:** TypeScript strict mode
- **Framework:** React 18 + Vite
- **Testing:** Vitest (`npm test` runs all tests)
- **UI:** Shadcn/UI (Radix primitives) + Tailwind CSS v4 (`@tailwindcss/vite` plugin, no tailwind.config.js)
- **State:** Zustand (3 stores: usePolicyStore, usePersonaStore, useEvaluationStore). useEvaluationStore.activeView controls tab selection ('grid' | 'matrix' | 'sankey' | 'gaps' | 'impact' | 'baseline'). usePersonaStore owns `personaSlots` — the guided real-account mapping shared by Gaps and Baseline (six slots; the sixth, Remote Help Operator, is a *role* slot the classifier cannot derive); it lives in the store, not a view, so a mapping survives a tab switch, and `clear()` wipes it on logout and source switch.
- **Auth:** MSAL.js (`@azure/msal-react`), loginRedirect flow
- **Visualization:** D3 (d3-sankey, d3-selection) for Sankey diagram, CSS Grid for policy tiles
- **Font:** JetBrains Mono (Google Fonts)

## Architecture

```
src/
  engine/              # Pure TypeScript, zero browser deps
    models/            # Policy, SimulationContext, EvaluationResult, NamedLocations
    conditions/        # 11 matchers (User, Application, DevicePlatform, Location, ClientApp, Risk, DeviceFilter, AuthenticationFlow, InsiderRisk, ClientApplications, AgentRisk)
    PolicyEvaluator.ts # Single-policy evaluation, short-circuits on first failed condition
    GrantControlResolver.ts  # Cross-policy AND resolution
    SessionControlAggregator.ts  # Most-restrictive-wins merging
    CAEngine.ts        # Top-level orchestrator (4-phase trace)
  components/
    layout/            # AppLayout, Header, Sidebar, MainContent
    matrix/            # EvaluationMatrix, matrixUtils
    sankey/            # SankeyFunnel, sankeyUtils
    ui/                # Shadcn components
    AboutDialog.tsx    # Info/privacy dialog
    BaselineView.tsx   # Microsoft template baseline assessment tab
    ConsentBanner.tsx  # 403 admin consent required banner
    ExportChangesDialog.tsx # Change plan export (Summary/PowerShell/JSON)
    GapsView.tsx       # Coverage gap analysis tab
    ImpactView.tsx          # Policy impact analysis tab
    LimitationsDialog.tsx   # Known limitations dialog
    MobileNotice.tsx   # Narrow viewport notice overlay
    PolicyGraph.tsx    # CSS Grid tile view
    PersonaMappingPanel.tsx # Shared persona slot mapping (Gaps + Baseline)
    PolicyDetailPanel.tsx   # Slide-in detail panel
    ReleaseNotesDialog.tsx  # What's New dialog
    ResultsSummary.tsx # Verdict + policy breakdown (live-vs-sandbox line)
    ResultsTipsDialog.tsx   # Understanding Your Results dialog
    SandboxAssignmentEditor.tsx  # Inline assignment editing (chips, add controls)
    SandboxBar.tsx     # Sandbox mode bar + SandboxChip
    SandboxDiffPanel.tsx    # Sandbox-vs-live sweep comparison panel
    SandboxStateControl.tsx # On/Report/Off segmented control
    ScoringMethodologyDialog.tsx  # Weighted scoring explanation dialog
    ScenarioPanel.tsx  # Simulation controls sidebar
    TourGuide.tsx      # First-run guided tour overlay (data-tour anchors)
    UserSearchInput.tsx     # Reusable user search component
  stores/              # Zustand stores (usePolicyStore, usePersonaStore, useEvaluationStore — activeView includes 'impact')
  services/            # graphService (policy fetch, tenant app discovery), personaService
  lib/                 # deriveSatisfiedControls, gapAnalysis, gapPersonas, impactAnalysis, sweepDimensions, sandbox, sandboxDiff, sandboxExport, baselineAssessment, analytics, tour
  types/               # TenantApplication (app discovery type)
  data/                # theme.ts (COLORS, APP_VERSION), appBundles (GUID-only bundle registry), baselineChecks (check catalog), templatePolicies (template policy bodies), samplePolicies, samplePersonas
  authConfig.ts        # MSAL configuration
```

## Key Commands

```bash
npm test          # Run all engine tests (766 tests, Vitest)
npm run dev       # Start dev server (localhost:5173)
npm run build     # Production build (Vite)
```

## Critical Rules

### Engine Accuracy
- **Exclusion ALWAYS wins** over inclusion (user, group, role levels)
- **Per-policy grant evaluation** — each policy's AND/OR operator is independent, cross-policy is always AND
- **Block always wins** over any other grant control
- **Report-only never enforces** — evaluated identically but separated from the decision
- **No matching policies = implicit allow**
- **Empty clientAppTypes = matches ALL**
- **Risk levels use direct list membership** — no ordinal auto-escalation
- **roleTemplateId** for directory roles, NOT instance id
- **Agent identity isolation** — agent-identity sign-ins match ONLY via `clientApplications.includeAgentIdServicePrincipals` (users condition skipped); agent-targeting policies never apply to user/agent-user sign-ins; `All` and groups never match agent user accounts, only `AllAgentIdUsers` or direct id
- **Policy list fetches the BETA Graph endpoint** — v1.0 strips agent targeting (verified live); fallback to v1.0 sets `agentDetailsUnavailable`
- **Authentication strength is hierarchy-based** — MFA (1) < Passwordless MFA (2) < Phishing-resistant MFA (3); higher tiers satisfy lower requirements. Custom strengths resolve to a tier via `customAuthStrengthMap`; unknown strength IDs are never satisfied. Tier membership mirrors Microsoft's built-in strength table, NOT "is it password-free" — TAP and federated methods use no password but grade MFA-only.
- **Device compliance and join type are independent** — the "Require Microsoft Entra hybrid joined device" grant control is satisfied by hybrid join ONLY; Entra joined and Entra registered do not satisfy it. Compliance requires an Entra device identity, so unregistered + compliant is an impossible state.

### D3 ↔ React Boundary
- React renders the `<svg>` container, D3 manages all SVG internals via `useEffect` + `useRef`
- D3 never reads from or writes to React state directly
- d3-sankey **mutates its input** — always deep-copy nodes/links before layout

### Tailwind v4
- No `tailwind.config.js` — uses `@tailwindcss/vite` plugin
- CSS vars mapped in `@theme inline` blocks in `src/index.css`
- Color system: `src/data/theme.ts` (COLORS + CATEGORY_META + APP_VERSION) is the single source of truth

### MSAL Auth
- **loginRedirect** (NOT loginPopup — popup loads full SPA and never closes)
- Use `accounts[0]` from `useMsal()` (reactive), NOT `instance.getActiveAccount()` (stale)
- Instance created and initialized outside React component tree
- Tenant name fetched on LOGIN_SUCCESS (main.tsx) + on page refresh (Header useEffect)

### Error Handling
- Graph API 403 → `GraphPermissionError` → store error `'ADMIN_CONSENT_REQUIRED'` → `ConsentBanner` in MainContent
- `ConsentBanner` includes dynamic admin consent URL, admin/non-admin guidance, and "Use Sample Data" fallback
- Non-consent errors still display inline in ScenarioPanel
- Console error statements log `err.message` only (not full error objects) to prevent tenant data leakage

### Analytics
- **Two transports, split by capability.** Page views go to Vercel Web Analytics via `<Analytics/>` in `main.tsx`; the ten product events POST to `/api/e`, an edge function (`api/e.ts`) relaying to a self-hosted Umami. Vercel Hobby supports no custom events, which is why the events collected nothing before v0.6.14.
- **The Umami address is `process.env.UMAMI_URL`, never committed** — this repo is mirrored publicly, and a redaction step you must remember is a step you will eventually forget. Set it in Vercel for Production AND Preview; unset, `/api/e` returns 503 and events stop silently. `api/` is in `tsconfig.json` include, so the function typechecks locally.
- The function forwards `User-Agent` and `X-Forwarded-For` deliberately: Umami drops requests without a UA, and without the client IP every visitor collapses into one hash — wrong counts rather than absent ones.
- **No Umami tracker script is loaded.** `/api/send` accepts a plain POST with no auth token, so `analytics.ts` posts directly. Keeps `script-src 'self'`, gives autocapture no surface to exist on, and leaves an ad blocker looking at a same-origin path — which matters when the audience is security admins.
- **Never add `referrer` to the Umami payload.** An internal wiki link puts `https://<customer>.sharepoint.com` in that field. It arrives as an HTTP header, so `isAllowed()` cannot see it — the allowlist guards props, not headers. Verified empty on the live instance; keep it that way.
- Umami also accepts `screen`, `language`, `title` and the real `url`. All omitted; `url` is a constant `'/'`. A test asserts the payload has exactly four keys, so re-adding one fails rather than shipping quietly.
- Country, browser and device ARE recorded — derived server-side from IP and user-agent, as any web server can. The IP itself is never stored (Umami has no column for it). Do not claim otherwise on the privacy page.
- `src/lib/analytics.ts` is the ONLY module that may import `@vercel/analytics` or post to the event endpoint — every event goes through `trackEvent()`
- Payloads are **enum-only**, enforced at runtime by `isAllowed()` (types don't exist at runtime; baseline check ids arrive as plain strings)
- Props must match the allowlist exactly — an extra key is rejected, not ignored. Never send policy/app/group/user/tenant names, GUIDs, error messages, or counts (counts are tenant fingerprints)
- `isAnalyticsEnabled()` requires a browser: the endpoint is a relative path that cannot resolve outside one, which would break store tests
- DNT and the About-dialog opt-out both gate emission; `beforeSend` extends the same switch to Vercel's page views. Without it one opt-out would silence Umami while page views continued — a test asserts both stop together
- The allowlist and `public/privacy/index.html` are a matched pair — changing one requires changing the other
- `evaluate()` takes a REQUIRED `trigger` ('auto' | 'manual') so new call sites must declare intent — five paths exist and four are automatic
- Never send verdicts, scenarios, or sweep findings — only that a run happened. `app_error` sends the kind, never the message (Graph/MSAL text names tenants)

### Security
- `@odata.nextLink` URLs validated against `https://graph.microsoft.com/` before following with bearer token
- 429 retry limited to 3 attempts (prevents infinite recursion)
- User IDs validated as GUID format before Graph API path interpolation
- All Zustand stores cleared before logout redirect
- CSP: `frame-src 'self'` + `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` for MSAL silent token renewal
- HSTS header: `max-age=63072000; includeSubDomains; preload`
- sessionStorage for MSAL token cache (not localStorage)
- Source maps disabled in production builds

## Plan Mode Policy

**Plan mode required** for prompt packets that:
- Touch 4 or more files
- Introduce a new component, matcher, or view
- Change the store schema
- Modify the engine pipeline

**Plan mode optional** for:
- Bug fixes
- Styling changes
- Adding fields to existing components
- Test additions for existing logic

## Source of Truth

`docs/project-instructions.md` contains the complete spec: all architectural decisions, data models, evaluation rules, and hard-won lessons (#1-65).

## Testing

All 766 tests are in `src/engine/__tests__/`, `src/lib/__tests__/`, `src/services/__tests__/`, `src/stores/__tests__/`, and `src/data/__tests__/`. Test fixtures are in `__tests__/fixtures/`. Each condition matcher has its own test file, plus tests for the policy evaluator, grant resolver, session aggregator, authentication strength hierarchy, full engine integration, gap analysis, impact analysis, persona-aware baseline assessment, and the analytics allowlist. Tests use real policy structures and contexts — the engine is never mocked. Mocks exist only at I/O boundaries: `fetch` (analytics transport), `services/auth` and `services/personaService` (both read `window` at import time). Run `npm test` before committing.

## Impact Analysis Engine

`src/lib/impactAnalysis.ts` contains the impact analysis engine:
- `analyzeImpactSweep()` — for each enabled policy, removes it and re-evaluates all 5,760 scenarios
- `computePostureScore()` — weighted 0-10 score per scenario (block=10, authStrength=5, MFA=3, compliantDevice=3, appProtection=2)
- `computeSeverity()` — Critical/High/Medium/Low based on verdict changes, affected scenarios, and fallback existence
- `findFallbackPolicies()` — semantic control equivalence (authStrength↔MFA, compliantDevice↔domainJoined)
- `findOtherProtection()` — remaining policies enforcing different controls
- `describeFallback()` — contextual descriptions with policy scope
- `describePolicyScope()` — extracts human-readable scope from policy conditions
- Control weights are exported constants (`CONTROL_WEIGHTS`, `AUTH_STRENGTH_WEIGHT`)
- Sweep dimensions from `src/lib/sweepDimensions.ts` — 3 user types × 3 apps × 5 platforms × 4 client apps × 2 locations × 4 risk × 4 user risk = 5,760 combinations
- Agent grids (`buildAgentSweepContexts`): 3 apps × 2 locations × 4 agent risk per agent identity type (48 total) — parallel to the user sweep, NEVER merged into it (posture scoring is human-control-based; agent scenarios are block-or-allow). Used by sandboxDiff and impactAnalysis; agent protection loss (newlyAllowed > 0) escalates removal severity to critical

## Sandbox (v0.5+)

- Hypothetical state lives in usePolicyStore as deviations-only maps: `sandboxOverrides` (state), `sandboxAssignments` (per-field array replacements), `sandboxDrafts` (whole policies). The maps ARE the change list.
- Derived `effectivePolicies` is the single choke point — every view/analysis reads it, NEVER `policies` directly (exception: ResultsSummary reads raw `policies` for the live-comparison line).
- Engine is never modified by sandbox features; overrides apply before evaluation (`lib/sandbox.ts`).
- Refresh prunes overrides (kept when live value changed underneath — intent, not 3-way merge); source switch/logout clears; Reset clears changes but stays in sandbox mode.
- Diff: `lib/sandboxDiff.ts` compareSweeps (user sweep + parallel agent grids); export: `lib/sandboxExport.ts` (Graph PATCH/POST + PowerShell + Markdown, local only — the app NEVER writes to the tenant; agent-bearing policies route to the beta URI).

## Baseline Assessment

- `data/baselineChecks.ts` (23 checks, 6 categories incl. aiAgents) + `lib/baselineAssessment.ts` — OUTCOME-BASED: target scenarios must have the expected protection GUARANTEED (block satisfies everything; auth strength is tier-aware). An OR grant counts only if EVERY alternative satisfies the expectation — `[compliantDevice, domainJoinedDevice]` guarantees device trust, `[mfa, compliantDevice]` guarantees neither. Composite expectations (`device-trust-and-phishing-resistant-mfa`) are judged per part, each part by any applied policy (cross-policy AND).
- **Slot-scoped checks** (`assessment.slot`) sweep ONLY the real account mapped into that persona slot — no synthetic persona, because the slot carries a role no account property reveals (Remote Help helper = Intune RBAC). Nothing mapped → status `unmapped`: in the status tally, outside every pass/total. Both Remote Help checks sweep Windows + macOS only (Microsoft supports CA for Remote Help there only; it does not apply to unattended access).
- **Real personas run ALONGSIDE the synthetic ones** (`assessBaseline(policies, authStrengthMap, personas)`). The synthetic admin carries the GA role template id, no groups and no real object id, so nothing can exclude it — a policy that guarantees the control but excludes real admins passed 120/120 while the actual GA was uncovered. Class is derived from the account (`classifyPersona`), not the slot it sits in. Break-glass and service accounts are evaluated but partitioned out of the arithmetic entirely.
- Statuses: pass / reportOnly (promoting report-only policies would fix it) / partial / fail / unmapped (slot-scoped, nothing mapped — never run). Licensing unknowable → P2/Purview checks fail honestly with badges.
- `data/templatePolicies.ts` — Fix-in-sandbox template bodies, static or factory (`(ctx) => body | null`); ALWAYS resolve via `resolveTemplate(checkId, ctx)`, never `.get()`. The operator template scopes itself to the mapped account (the tool cannot know the operators group) and the export marks it with a `deployNote`. Self-test loop: every template must satisfy its own check (`data/__tests__/templatePolicies.test.ts`), factories fed a fixture operator.
- Agent checks sweep synthetic agent contexts (no personas, no device platform).

## Guided Tour (v0.6.16)

- `lib/tour.ts` (steps + seen flag + `positionBubble` geometry) + `components/TourGuide.tsx` (overlay). Nine stops: data source, Simulation Context, the six tabs, sandbox switch.
- **Points and explains — never clicks.** No store is touched, no view switched, no evaluation run, so it behaves identically before and after data loads.
- Targets carry a `data-tour="..."` attribute; steps whose anchor doesn't resolve are dropped when the tour opens. `findAnchor` checks `getClientRects().length`, NOT just presence — the sidebar is hidden with `display: none`, not unmounted.
- Auto-starts once per browser (`ca-sim:tour-seen`, the app's second and only other localStorage key), gated to ≥768px so it can't collide with `MobileNotice`. The header compass button replays it.
- Only the geometry is tested — this project has no component tests.

## Conventions

- Use Shadcn/UI components for standard UI elements — no custom CSS for buttons, inputs, cards, etc.
- Dark theme only. Colors from `COLORS` object in `data/theme.ts`.
- 8 policy categories: Identity (purple), Security (red), Device (cyan), Location (orange), Risk (pink), App Protection (violet), Session (teal), Agents (lime).
- Stores are independent — no circular imports between stores.
- Sample/demo mode uses `dataSource` discriminator in usePolicyStore ('none' | 'live' | 'sample').

## Git Workflow

### Branch Strategy

- **`main`** — Sacred. Always deployable to production. Never commit directly.
- **`dev`** — Integration branch. All work merges here first for testing before promoting to `main`.
- **Feature branches** — Short-lived, branched from `dev`, named by version and feature:
  ```
  feature/v{version}-{feature-name}
  ```
  Examples: `feature/v033-session-controls`, `feature/v033-auth-strength`, `feature/v04-byoar`

### Workflow

1. Start work: `git checkout dev && git pull && git checkout -b feature/v033-my-feature`
2. Do work on the feature branch, commit frequently with descriptive messages
3. When done: merge feature branch → `dev`, test, then delete the feature branch
4. When `dev` is stable and tested: merge `dev` → `main`, tag the release

### Commit Messages

Use conventional commits:
- `feat:` — new feature or capability
- `fix:` — bug fix
- `security:` — security hardening
- `refactor:` — code restructuring without behavior change
- `test:` — adding or updating tests
- `docs:` — documentation only
- `chore:` — build, deps, config changes

### Rules

- **Never force-push to `main` or `dev`**
- **Delete feature branches after merge** — don't leave stale branches
- **Always run `npm test` before merging to `dev`**
- **Tag releases on `main`** with `v{version}` (e.g., `v0.3.3`)