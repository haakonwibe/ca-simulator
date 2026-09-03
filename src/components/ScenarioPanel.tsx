// components/ScenarioPanel.tsx — Sidebar simulation context controls.

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { ADMIN_CONSENT_ERROR } from '@/services/graphClient';
import { type EventTrigger } from '@/lib/analytics';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { usePersonaStore } from '@/stores/usePersonaStore';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import { COLORS } from '@/data/theme';
import type { SimulationContext } from '@/engine/models/SimulationContext';
import { deriveSatisfiedControls, deriveAuthStrengthLevel } from '@/lib/deriveSatisfiedControls';
import type { ClientAppType, DevicePlatform, RiskLevel, InsiderRiskLevel } from '@/engine/models/Policy';
import type { UserSearchResult } from '@/services/personaService';
import { useUserSearch } from '@/hooks/useUserSearch';
import { APP_BUNDLES } from '@/data/appBundles';
import { REMOTE_HELP_APP_ID } from '@/data/baselineChecks';
import { AboutDialog } from '@/components/AboutDialog';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RefreshCw,
  Download,
  Search,
  Zap,
  User,
  AppWindow,
  Monitor,
  Globe,
  ShieldAlert,
  MapPin,
  Laptop,
  KeyRound,
  Smartphone,
  Loader2,
  X,
  FlaskConical,
  CheckCircle2,
  ArrowRightLeft,
  Target,
  Fingerprint,
  Bot,
} from 'lucide-react';

const GENERIC_AGENT_ID = 'generic-agent';

const IDENTITY_TYPE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'agentIdentity', label: 'Agent identity' },
  { value: 'agentUser', label: 'Agent user account' },
] as const;

// ── Static option lists ─────────────────────────────────────────────

const PLATFORM_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'windows', label: 'Windows' },
  { value: 'macOS', label: 'macOS' },
  { value: 'iOS', label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'linux', label: 'Linux' },
] as const;

const CLIENT_APP_OPTIONS = [
  { value: 'browser', label: 'Browser' },
  { value: 'mobileAppsAndDesktopClients', label: 'Mobile apps and desktop clients' },
  { value: 'exchangeActiveSync', label: 'Exchange ActiveSync' },
  { value: 'other', label: 'Other clients' },
] as const;

const RISK_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const;

const INSIDER_RISK_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'elevated', label: 'Elevated' },
] as const;

const LOCATION_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'trusted', label: 'Trusted' },
  { value: 'untrusted', label: 'Untrusted' },
] as const;

// Compliance and join type are independent in Entra, so they get one control
// each. A single select could only cover the space by hardcoding combinations,
// which left "Any" and "Unmanaged" evaluating identically and made Entra joined
// unreachable.
const DEVICE_COMPLIANCE_OPTIONS = [
  { value: 'any', label: 'Any', description: 'No compliance signal' },
  { value: 'compliant', label: 'Compliant (Intune MDM)', description: 'Enrolled and passing policy' },
  { value: 'nonCompliant', label: 'Non-compliant', description: 'Enrolled but failing policy' },
] as const;

const DEVICE_JOIN_OPTIONS = [
  { value: 'unregistered', label: 'Unregistered', description: 'Not known to Entra' },
  { value: 'entraJoined', label: 'Microsoft Entra joined', description: 'Cloud-joined — the modern default' },
  { value: 'hybrid', label: 'Hybrid joined', description: 'AD domain-joined, synced to Entra' },
  { value: 'registered', label: 'Entra registered', description: 'Personal device, work account' },
] as const;

/** Picker value → the trustType the device filter grammar sees. */
const JOIN_TRUST_TYPES: Record<string, 'azureADJoined' | 'hybridAzureADJoined' | 'azureADRegistered' | undefined> = {
  unregistered: undefined,
  entraJoined: 'azureADJoined',
  hybrid: 'hybridAzureADJoined',
  registered: 'azureADRegistered',
};

// Descriptions name the concrete methods — the tier names alone read as three
// points on one line, when passwordless and phishing-resistant are separate
// properties (no typed secret / bound to the sign-in origin).
const AUTH_OPTIONS = [
  { value: 'none', label: 'None', description: 'Password only' },
  { value: 'mfa', label: 'MFA', description: 'Password + SMS, voice, push, or token' },
  { value: 'passwordlessMfa', label: 'Passwordless MFA', description: 'No password — e.g. Authenticator phone sign-in' },
  { value: 'phishingResistantMfa', label: 'Phishing-resistant MFA', description: 'Origin-bound — passkey, Windows Hello, CBA' },
] as const;

const AUTH_FLOW_OPTIONS = [
  { value: 'none', label: 'Normal sign-in', description: 'Standard interactive sign-in' },
  { value: 'deviceCodeFlow', label: 'Device Code Flow', description: 'Code entered on another device — TVs, CLI, IoT' },
  { value: 'authenticationTransfer', label: 'Authentication Transfer', description: 'Signed-in session passed to a nearby device' },
] as const;

const APP_PROTECTION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'approvedApp', label: 'Approved App (MAM)' },
  { value: 'managedApp', label: 'Managed App (App Compliance)' },
  { value: 'both', label: 'Approved + Managed' },
] as const;

const TARGET_MODE_OPTIONS = [
  { value: 'resources', label: 'Resources (Cloud Apps)', description: 'Apps and services the user signs in to' },
  { value: 'userActions', label: 'User Actions', description: 'Registering security info or a device' },
  { value: 'authContext', label: 'Authentication Context', description: 'Extra controls for tagged sites and labels' },
] as const;

const USER_ACTION_OPTIONS = [
  { value: 'registerSecurityInformation', label: 'Register security information' },
  { value: 'registerOrJoinDevices', label: 'Register or join devices' },
] as const;

const AUTH_CONTEXT_OPTIONS = [
  { value: 'c1', label: 'C1' },
  { value: 'c2', label: 'C2' },
  { value: 'c3', label: 'C3' },
] as const;

// ── Component ───────────────────────────────────────────────────────

export function ScenarioPanel() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Stores
  const policies = usePolicyStore((s) => s.effectivePolicies);
  const policyLoading = usePolicyStore((s) => s.isLoading);
  const policyError = usePolicyStore((s) => s.error);
  const dataSource = usePolicyStore((s) => s.dataSource);
  const authStrengthMap = usePolicyStore((s) => s.authStrengthMap);
  const displayNames = usePolicyStore((s) => s.displayNames);
  const agentDetailsUnavailable = usePolicyStore((s) => s.agentDetailsUnavailable);
  const resolvedPersonas = usePersonaStore((s) => s.resolvedPersonas);
  const selectedPersonaId = usePersonaStore((s) => s.selectedPersonaId);
  const isResolving = usePersonaStore((s) => s.isResolving);
  const evaluate = useEvaluationStore((s) => s.evaluate);

  const isSampleMode = dataSource === 'sample';

  // Form state
  const [identityType, setIdentityType] = useState<'user' | 'agentIdentity' | 'agentUser'>('user');
  const [selectedAgentId, setSelectedAgentId] = useState<string>(GENERIC_AGENT_ID);
  const [agentRisk, setAgentRisk] = useState<RiskLevel | 'none'>('none');
  const [targetMode, setTargetMode] = useState<'resources' | 'userActions' | 'authContext'>('resources');
  const [userAction, setUserAction] = useState<string>('registerSecurityInformation');
  const [authContext, setAuthContext] = useState<string>('c1');
  const [appId, setAppId] = useState('All');
  const [platform, setPlatform] = useState('any');
  const [clientApp, setClientApp] = useState<ClientAppType>('browser');
  const [signInRisk, setSignInRisk] = useState<RiskLevel | 'none'>('none');
  const [userRisk, setUserRisk] = useState<RiskLevel | 'none'>('none');
  const [insiderRisk, setInsiderRisk] = useState<InsiderRiskLevel | 'none'>('none');
  const [location, setLocation] = useState('any');
  const [deviceCompliance, setDeviceCompliance] = useState('any');
  const [deviceJoin, setDeviceJoin] = useState('unregistered');
  const [authentication, setAuthentication] = useState<'none' | 'mfa' | 'passwordlessMfa' | 'phishingResistantMfa'>('none');
  const [authFlow, setAuthFlow] = useState<'none' | 'deviceCodeFlow' | 'authenticationTransfer'>('none');
  const [appProtection, setAppProtection] = useState<'none' | 'approvedApp' | 'managedApp' | 'both'>('none');
  const [passwordChanged, setPasswordChanged] = useState(false);

  // About dialog state
  const [aboutOpen, setAboutOpen] = useState(false);

  // Button feedback state (Fix 5)
  const [justEvaluated, setJustEvaluated] = useState(false);
  const evaluatedFlashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Clear stale results helper (Fix 3)
  const clearResults = () => useEvaluationStore.getState().clear();

  // User search (shared debounced hook — handles stale-response races and cleanup)
  const {
    searchQuery,
    searchResults,
    isSearching,
    showResults,
    setShowResults,
    handleFocus: handleSearchFocus,
    handleChange: handleSearchChange,
    reset: resetSearch,
  } = useUserSearch();
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Get selected persona context
  const selectedPersona = selectedPersonaId
    ? resolvedPersonas.get(selectedPersonaId) ?? null
    : null;

  // ── Policy loading ────────────────────────────────────────────────

  const handleLoadPolicies = async () => {
    try {
      await usePolicyStore.getState().loadFromGraph();
    } catch (err) {
      console.error('Failed to load policies:', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleLoadSampleData = () => {
    usePolicyStore.getState().loadSampleData();
    // Auto-select first persona and evaluate (Fix 6)
    usePersonaStore.getState().resolveAndCacheSample('sample-user-1');
    const persona = usePersonaStore.getState().resolvedPersonas.get('sample-user-1');
    const policies = usePolicyStore.getState().effectivePolicies;
    if (persona && policies.length > 0) {
      const context: SimulationContext = {
        user: persona,
        application: { appId: 'All', displayName: 'All Cloud Apps' },
        device: {},
        location: {},
        risk: { signInRiskLevel: 'none', userRiskLevel: 'none', insiderRiskLevel: 'none' },
        clientAppType: 'browser',
        satisfiedControls: [],
      };
      useEvaluationStore.getState().evaluate(policies, context, 'auto');
    }
  };

  // ── User search selection ─────────────────────────────────────────

  const handleSelectUser = async (user: UserSearchResult) => {
    clearResults();
    resetSearch();

    if (isSampleMode) {
      usePersonaStore.getState().resolveAndCacheSample(user.id);
      return;
    }

    try {
      await usePersonaStore.getState().resolveAndCache(user.id);
    } catch (err) {
      console.error('Failed to resolve user:', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleQuickSelect = (userId: string) => {
    clearResults();
    usePersonaStore.getState().selectPersona(userId);
  };

  // Close search results on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Keyboard shortcut (Fix 4) ────────────────────────────────────

  const handleEvaluateRef = useRef<(trigger: EventTrigger) => void>(() => {});
  const canEvaluateRef = useRef(false);

  // Refs are updated below after handleEvaluate is defined

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canEvaluateRef.current) handleEvaluateRef.current('manual'); // Ctrl/Cmd+Enter
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Tenant-specific app options ─────────────────────────────────────

  const tenantApplications = usePolicyStore((s) => s.tenantApplications);

  const tenantApps = useMemo(() =>
    tenantApplications.map((app) => ({ value: app.appId, label: app.displayName })),
    [tenantApplications],
  );

  // Agent identities referenced by loaded policies (plus a synthetic generic)
  const agentOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const p of policies) {
      const ca = p.conditions.clientApplications;
      for (const id of [
        ...(ca?.includeAgentIdServicePrincipals ?? []),
        ...(ca?.excludeAgentIdServicePrincipals ?? []),
      ]) {
        if (id !== 'All') ids.add(id);
      }
    }
    return [
      { value: GENERIC_AGENT_ID, label: 'Generic agent' },
      ...[...ids].map((id) => ({ value: id, label: displayNames.get(id) ?? `${id.slice(0, 8)}…` })),
    ];
  }, [policies, displayNames]);

  const selectedAgentLabel =
    agentOptions.find((a) => a.value === selectedAgentId)?.label ?? 'Generic agent';

  // ── Evaluate ──────────────────────────────────────────────────────

  const canEvaluate =
    policies.length > 0 && (identityType === 'agentIdentity' || selectedPersona !== null);

  const handleEvaluate = (trigger: EventTrigger) => {
    const isAgentIdentity = identityType === 'agentIdentity';
    if (!isAgentIdentity && !selectedPersona) return;

    const application = targetMode === 'userActions'
      ? {
          appId: '',
          displayName: 'User Action',
          userAction: userAction as 'registerSecurityInformation' | 'registerOrJoinDevices',
        }
      : targetMode === 'authContext'
      ? {
          appId: '',
          displayName: 'Authentication Context',
          authenticationContext: authContext,
        }
      : {
          appId,
          displayName:
            appId === 'AllAgentIdResources'
              ? 'All Agent Resources'
              : appId === REMOTE_HELP_APP_ID
              ? 'Remote Help'
              : APP_BUNDLES.find((b) => b.id === appId)?.displayName
                ?? tenantApps.find((a) => a.value === appId)?.label
                ?? appId,
          ...(appId === 'AllAgentIdResources' ? { isAgentResource: true } : {}),
        };

    const context: SimulationContext = {
      user: isAgentIdentity
        ? {
            id: GENERIC_AGENT_ID,
            displayName: selectedAgentLabel,
            userType: 'member',
            memberOfGroupIds: [],
            directoryRoleIds: [],
          }
        : selectedPersona!,
      identityType,
      ...(isAgentIdentity
        ? { agent: { servicePrincipalId: selectedAgentId, displayName: selectedAgentLabel } }
        : {}),
      application,
      device: {
        platform: platform === 'any' ? undefined : (platform as DevicePlatform),
        isCompliant:
          deviceCompliance === 'any' ? undefined : deviceCompliance === 'compliant',
        trustType: JOIN_TRUST_TYPES[deviceJoin],
      },
      location: {
        isTrustedLocation:
          location === 'any' ? undefined : location === 'trusted',
      },
      risk: {
        signInRiskLevel: signInRisk,
        userRiskLevel: userRisk,
        insiderRiskLevel: insiderRisk,
        // Agent risk applies to both agent identities and agent user accounts
        ...(identityType !== 'user' ? { agentRiskLevel: agentRisk } : {}),
      },
      clientAppType: clientApp,
      authenticationFlow: authFlow === 'none' ? undefined : authFlow,
      // Agents don't satisfy human auth controls — MFA/device/app-protection inputs are user-only
      authenticationStrengthLevel: isAgentIdentity ? 0 : deriveAuthStrengthLevel(authentication),
      customAuthStrengthMap: authStrengthMap.size > 0 ? authStrengthMap : undefined,
      satisfiedControls: isAgentIdentity
        ? []
        : deriveSatisfiedControls({ authentication, deviceCompliance, deviceJoin, appProtection, passwordChanged }),
    };

    evaluate(policies, context, trigger);

    // Button feedback flash (Fix 5) — dedupe rapid clicks, clean up on unmount
    setJustEvaluated(true);
    if (evaluatedFlashTimer.current) clearTimeout(evaluatedFlashTimer.current);
    evaluatedFlashTimer.current = setTimeout(() => setJustEvaluated(false), 1000);
  };

  // Keep refs current for keyboard shortcut (Fix 4) — in an effect, not during
  // render (render-phase ref writes are unsafe under concurrent rendering)
  useEffect(() => {
    handleEvaluateRef.current = handleEvaluate;
    canEvaluateRef.current = canEvaluate;
  });

  // Sandbox toggles swap out effectivePolicies — re-run the current evaluation
  // so the visible verdict never goes stale. Result is read via getState() to
  // avoid depending on it (each evaluate() produces a new result object).
  useEffect(() => {
    if (useEvaluationStore.getState().result && canEvaluateRef.current) {
      handleEvaluateRef.current('auto'); // policies changed underneath, not a user action
    }
  }, [policies]);

  useEffect(() => {
    return () => {
      if (evaluatedFlashTimer.current) clearTimeout(evaluatedFlashTimer.current);
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">
          Simulation Context
        </h2>
      </div>
      <Separator />

      {/* Scrollable controls */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Policy loading */}
        <div>
          {policies.length === 0 ? (
            <div className="space-y-2">
              {/* Sample data — always available, primary when not signed in */}
              <Button
                variant={isAuthenticated ? 'outline' : 'default'}
                size="sm"
                className="w-full gap-2"
                onClick={handleLoadSampleData}
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Use Sample Data
              </Button>

              {/* Live data — requires auth */}
              {isAuthenticated ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleLoadPolicies}
                  disabled={policyLoading}
                >
                  {policyLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {policyLoading ? 'Loading...' : 'Load from Tenant'}
                </Button>
              ) : (
                <div className="text-center space-y-1">
                  <p className="text-[10px] text-muted-foreground">
                    Sign in to load live tenant policies
                  </p>
                  <button
                    onClick={() => setAboutOpen(true)}
                    className="text-xs hover:underline"
                    style={{ color: COLORS.accent }}
                  >
                    What is this?
                  </button>
                </div>
              )}

              {policyError && policyError !== ADMIN_CONSENT_ERROR && (
                <p className="text-xs text-destructive">{policyError}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              {isSampleMode ? (
                <Badge
                  variant="outline"
                  className="text-xs font-normal"
                  style={{ color: COLORS.accentLight, borderColor: COLORS.accentLightFaded }}
                >
                  Sample Mode &middot; {policies.length} policies
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs font-normal">
                  {policies.length} policies loaded
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={isSampleMode ? handleLoadSampleData : handleLoadPolicies}
                disabled={policyLoading}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${policyLoading ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          )}
          {agentDetailsUnavailable && policies.length > 0 && (
            <p className="mt-1.5 text-[10px] leading-tight" style={{ color: COLORS.warning }}>
              Agent policy details unavailable (beta endpoint unreachable) — agent
              targeting is not visible in these policies.
            </p>
          )}
        </div>

        <Separator />

        {/* Identity type */}
        <div>
          <SectionLabel icon={<Bot className="h-3 w-3" />} label="Identity Type" />
          <Select
            value={identityType}
            onValueChange={(v: 'user' | 'agentIdentity' | 'agentUser') => { clearResults(); setIdentityType(v); }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IDENTITY_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {identityType === 'agentUser' && (
            <p className="mt-1 text-[10px] leading-tight" style={{ color: COLORS.textDim }}>
              Agent user accounts are only matched by "All agent users" or a direct
              id — "All users" and group scoping do not cover them.
            </p>
          )}
        </div>

        {/* Agent picker (agent identity mode) + risk (both agent modes) */}
        {identityType !== 'user' && (
          <div className="space-y-4">
            {identityType === 'agentIdentity' && (
            <div>
              <SectionLabel icon={<Bot className="h-3 w-3" />} label="Agent" />
              <Select value={selectedAgentId} onValueChange={(v) => { clearResults(); setSelectedAgentId(v); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agentOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {agentOptions.length > 1 && (
                <p className="mt-1 text-[10px] leading-tight" style={{ color: COLORS.textDim }}>
                  Agents referenced by loaded policies appear here.
                </p>
              )}
            </div>
            )}
            <div>
              <SectionLabel icon={<ShieldAlert className="h-3 w-3" />} label="Agent Risk" />
              <Select value={agentRisk} onValueChange={(v: RiskLevel | 'none') => { clearResults(); setAgentRisk(v); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['none', 'low', 'medium', 'high'] as const).map((level) => (
                    <SelectItem key={level} value={level} className="text-xs">
                      {level === 'none' ? 'None' : level.charAt(0).toUpperCase() + level.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* User / Persona search + Authentication (not applicable to agent identities) */}
        {identityType !== 'agentIdentity' && (
        <div>
          <SectionLabel icon={<User className="h-3 w-3" />} label={identityType === 'agentUser' ? 'Agent User' : 'User'} />

          {/* Quick-select chips for previously resolved personas */}
          {resolvedPersonas.size > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {[...resolvedPersonas.entries()].map(([id, persona]) => (
                <button
                  key={id}
                  onClick={() => handleQuickSelect(id)}
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs transition-colors ${
                    id === selectedPersonaId
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-transparent text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {persona.displayName.split(' ')[0]}
                </button>
              ))}
            </div>
          )}

          {/* Search input */}
          <div ref={searchContainerRef} className="relative">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={isSampleMode ? 'Search sample users...' : 'Search users...'}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={handleSearchFocus}
                className="h-8 pl-8 pr-8 text-xs"
              />
              {isSearching && (
                <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
              {searchQuery && !isSearching && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={resetSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Search results dropdown */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/50 first:rounded-t-md last:rounded-b-md"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">
                        {user.displayName}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {user.userPrincipalName}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                      {user.userType?.toLowerCase() === 'guest' ? 'Guest' : 'Member'}
                    </Badge>
                  </button>
                ))}
                {!isSampleMode && searchResults.length >= 10 && (
                  <div className="px-3 py-1.5 text-[10px]" style={{ color: COLORS.textDim }}>
                    Type to narrow results...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Selected persona info */}
          {isResolving && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Resolving memberships...
            </div>
          )}
          {selectedPersona && !isResolving && (
            <div className="mt-2 rounded-md border border-border bg-card/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">
                  {selectedPersona.displayName}
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {selectedPersona.userType === 'member' ? 'Member' : 'Guest'}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                <span>{selectedPersona.memberOfGroupIds.length} groups</span>
                <PersonaRoles roleIds={selectedPersona.directoryRoleIds} displayNames={displayNames} />
              </div>
            </div>
          )}
        </div>
        )}

        {/* Authentication (human identities only — agents don't satisfy MFA) */}
        {identityType !== 'agentIdentity' && (
        <div>
          <SectionLabel icon={<KeyRound className="h-3 w-3" />} label="Authentication" />
          <Select value={authentication} onValueChange={(v: 'none' | 'mfa' | 'passwordlessMfa' | 'phishingResistantMfa') => { clearResults(); setAuthentication(v); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTH_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs" description={opt.description}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        )}

        {/* Authentication Flow */}
        <div>
          <SectionLabel icon={<ArrowRightLeft className="h-3 w-3" />} label="Authentication Flow" />
          <Select value={authFlow} onValueChange={(v: 'none' | 'deviceCodeFlow' | 'authenticationTransfer') => { clearResults(); setAuthFlow(v); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTH_FLOW_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs" description={opt.description}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Target Resource */}
        <div>
          <SectionLabel icon={<Target className="h-3 w-3" />} label="Target Resource" />
          <Select value={targetMode} onValueChange={(v: 'resources' | 'userActions' | 'authContext') => { clearResults(); setTargetMode(v); setAppId('All'); setUserAction('registerSecurityInformation'); setAuthContext('c1'); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARGET_MODE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs" description={opt.description}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Application (Resources mode) */}
        {targetMode === 'resources' && (
          <div>
            <SectionLabel icon={<AppWindow className="h-3 w-3" />} label="Application" />
            <Select value={appId} onValueChange={(v) => { clearResults(); setAppId(v); }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="overflow-y-auto" position="popper" style={{ maxHeight: 'clamp(200px, 50vh, 70vh)' }}>
                <SelectGroup>
                  <SelectLabel className="text-[10px] text-muted-foreground">Bundles</SelectLabel>
                  {APP_BUNDLES.map((bundle) => (
                    <SelectItem
                      key={bundle.id}
                      value={bundle.id}
                      className="text-xs"
                      description={bundle.id !== 'All' ? bundle.description : undefined}
                    >
                      {bundle.displayName}
                    </SelectItem>
                  ))}
                  <SelectItem value="AllAgentIdResources" className="text-xs">
                    All Agent Resources
                  </SelectItem>
                  <SelectItem
                    value={REMOTE_HELP_APP_ID}
                    className="text-xs"
                    description="Intune Remote Help — Microsoft's guidance is to exclude it from CA"
                  >
                    Remote Help
                  </SelectItem>
                </SelectGroup>
                {tenantApps.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel className="text-[10px] text-muted-foreground">Tenant Apps</SelectLabel>
                      {tenantApps.map((app) => (
                        <SelectItem key={app.value} value={app.value} className="text-xs">
                          {app.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* User Action mode */}
        {targetMode === 'userActions' && (
          <div>
            <SectionLabel icon={<Fingerprint className="h-3 w-3" />} label="User Action" />
            <Select value={userAction} onValueChange={(v) => { clearResults(); setUserAction(v); }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USER_ACTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Authentication Context mode */}
        {targetMode === 'authContext' && (
          <div>
            <SectionLabel icon={<ShieldAlert className="h-3 w-3" />} label="Auth Context" />
            <Select value={authContext} onValueChange={(v) => { clearResults(); setAuthContext(v); }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTH_CONTEXT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Platform */}
        <div>
          <SectionLabel icon={<Monitor className="h-3 w-3" />} label="Platform" />
          <Select value={platform} onValueChange={(v) => { clearResults(); setPlatform(v); if (v !== 'iOS' && v !== 'android') setAppProtection('none'); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORM_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Client App Type */}
        <div>
          <SectionLabel icon={<Globe className="h-3 w-3" />} label="Client App Type" />
          <Select value={clientApp} onValueChange={(v) => { clearResults(); setClientApp(v as ClientAppType); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_APP_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* App Protection — only for iOS/Android */}
        {(platform === 'iOS' || platform === 'android') && (
          <div>
            <SectionLabel icon={<Smartphone className="h-3 w-3" />} label="App Protection" />
            <Select value={appProtection} onValueChange={(v: 'none' | 'approvedApp' | 'managedApp' | 'both') => { clearResults(); setAppProtection(v); }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APP_PROTECTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Sign-in Risk */}
        <div>
          <SectionLabel icon={<ShieldAlert className="h-3 w-3" />} label="Sign-in Risk" />
          <Select value={signInRisk} onValueChange={(v) => { clearResults(); setSignInRisk(v as RiskLevel | 'none'); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RISK_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* User Risk */}
        <div>
          <SectionLabel icon={<ShieldAlert className="h-3 w-3" />} label="User Risk" />
          <Select value={userRisk} onValueChange={(v) => { clearResults(); setUserRisk(v as RiskLevel | 'none'); if (v === 'none') setPasswordChanged(false); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RISK_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Insider Risk */}
        <div>
          <SectionLabel icon={<ShieldAlert className="h-3 w-3" />} label="Insider Risk" />
          <Select value={insiderRisk} onValueChange={(v) => { clearResults(); setInsiderRisk(v as InsiderRiskLevel | 'none'); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INSIDER_RISK_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Password Changed — only when User Risk is set */}
        {userRisk !== 'none' && (
          <div className="flex items-center justify-between">
            <SectionLabel icon={<KeyRound className="h-3 w-3" />} label="Password Changed" />
            <Switch
              id="password-changed"
              checked={passwordChanged}
              onCheckedChange={(checked) => { clearResults(); setPasswordChanged(checked); }}
              className="h-5 w-9 [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
            />
          </div>
        )}

        {/* Location */}
        <div>
          <SectionLabel icon={<MapPin className="h-3 w-3" />} label="Location" />
          <Select value={location} onValueChange={(v) => { clearResults(); setLocation(v); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Device Compliance */}
        <div>
          <SectionLabel icon={<Laptop className="h-3 w-3" />} label="Device Compliance" />
          <Select value={deviceCompliance} onValueChange={(v) => { clearResults(); setDeviceCompliance(v); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEVICE_COMPLIANCE_OPTIONS.map((opt) => {
                // Intune enrollment requires a device identity in Entra, so an
                // unregistered device has no compliance state at all (null,
                // not false). Offering one would model an impossible sign-in.
                const disabled = deviceJoin === 'unregistered' && opt.value !== 'any';
                return (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-xs"
                    disabled={disabled}
                    description={disabled ? 'Needs a registered device' : opt.description}
                  >
                    {opt.label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Device Join Type */}
        <div>
          <SectionLabel icon={<Laptop className="h-3 w-3" />} label="Device Join Type" />
          <Select value={deviceJoin} onValueChange={(v) => { clearResults(); setDeviceJoin(v); if (v === 'unregistered') setDeviceCompliance('any'); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEVICE_JOIN_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs" description={opt.description}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

      </div>

      {/* Fixed evaluate button at bottom */}
      <div className="border-t border-border px-4 py-3">
        <Button
          className="w-full gap-2"
          disabled={!canEvaluate && !justEvaluated}
          onClick={() => handleEvaluate('manual')}
          style={justEvaluated ? { borderColor: COLORS.granted } : undefined}
        >
          {justEvaluated ? (
            <>
              <CheckCircle2 className="h-4 w-4" style={{ color: COLORS.granted }} />
              <span style={{ color: COLORS.granted }}>Evaluated</span>
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              Evaluate
              <span className="ml-auto text-[10px] text-muted-foreground font-normal opacity-60">
                {navigator.platform?.includes('Mac') ? '\u2318\u21B5' : 'Ctrl+\u21B5'}
              </span>
            </>
          )}
        </Button>
      </div>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
}

// ── Small helper component ──────────────────────────────────────────

/**
 * Directory roles drive whether admin-scoped policies apply, so the persona
 * card names them rather than showing a count. Falls back to the count when
 * a live tenant returns role IDs the display-name map could not resolve.
 */
function PersonaRoles({
  roleIds,
  displayNames,
}: {
  roleIds: string[];
  displayNames: Map<string, string>;
}) {
  if (roleIds.length === 0) {
    return <span>No directory roles</span>;
  }
  const names = roleIds.map((id) => displayNames.get(id)).filter((n): n is string => Boolean(n));
  if (names.length === 0) {
    return <span>{roleIds.length} roles</span>;
  }
  const unresolved = roleIds.length - names.length;
  return (
    <span style={{ color: COLORS.warning }}>
      {names.join(', ')}
      {unresolved > 0 && ` +${unresolved} more`}
    </span>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
  );
}
