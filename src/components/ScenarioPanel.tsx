// components/ScenarioPanel.tsx — Sidebar simulation context controls.

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import { ADMIN_CONSENT_ERROR } from '@/services/graphClient';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { usePersonaStore } from '@/stores/usePersonaStore';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import { COLORS } from '@/data/theme';
import type { SimulationContext } from '@/engine/models/SimulationContext';
import { deriveSatisfiedControls, deriveAuthStrengthLevel } from '@/lib/deriveSatisfiedControls';
import type { ClientAppType, DevicePlatform, RiskLevel } from '@/engine/models/Policy';
import type { UserSearchResult } from '@/services/personaService';
import { APP_BUNDLES, BUNDLE_IDS, BUNDLED_APP_IDS } from '@/data/appBundles';
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
} from 'lucide-react';

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

const LOCATION_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'trusted', label: 'Trusted' },
  { value: 'untrusted', label: 'Untrusted' },
] as const;

const DEVICE_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'compliant', label: 'Compliant (Intune MDM)' },
  { value: 'domainJoined', label: 'Hybrid Azure AD Joined' },
  { value: 'compliantAndHybrid', label: 'Compliant + Hybrid Joined' },
  { value: 'unmanaged', label: 'Unmanaged' },
] as const;

const AUTH_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'mfa', label: 'MFA' },
  { value: 'passwordlessMfa', label: 'Passwordless MFA' },
  { value: 'phishingResistantMfa', label: 'Phishing-resistant MFA' },
] as const;

const AUTH_FLOW_OPTIONS = [
  { value: 'none', label: 'Normal sign-in' },
  { value: 'deviceCodeFlow', label: 'Device Code Flow' },
  { value: 'authenticationTransfer', label: 'Authentication Transfer' },
] as const;

const APP_PROTECTION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'approvedApp', label: 'Approved App (MAM)' },
  { value: 'managedApp', label: 'Managed App (App Compliance)' },
  { value: 'both', label: 'Approved + Managed' },
] as const;

/** IDs that should not appear as individual tenant apps (bundles + meta values) */
const HIDDEN_APP_IDS = new Set([...BUNDLE_IDS, 'None']);

// ── Component ───────────────────────────────────────────────────────

export function ScenarioPanel() {
  const isAuthenticated = useIsAuthenticated();

  // Stores
  const policies = usePolicyStore((s) => s.policies);
  const policyLoading = usePolicyStore((s) => s.isLoading);
  const policyError = usePolicyStore((s) => s.error);
  const displayNames = usePolicyStore((s) => s.displayNames);
  const dataSource = usePolicyStore((s) => s.dataSource);
  const resolvedPersonas = usePersonaStore((s) => s.resolvedPersonas);
  const selectedPersonaId = usePersonaStore((s) => s.selectedPersonaId);
  const isResolving = usePersonaStore((s) => s.isResolving);
  const evaluate = useEvaluationStore((s) => s.evaluate);

  const isSampleMode = dataSource === 'sample';

  // Form state
  const [appId, setAppId] = useState('All');
  const [platform, setPlatform] = useState('any');
  const [clientApp, setClientApp] = useState<ClientAppType>('browser');
  const [signInRisk, setSignInRisk] = useState<RiskLevel | 'none'>('none');
  const [userRisk, setUserRisk] = useState<RiskLevel | 'none'>('none');
  const [location, setLocation] = useState('any');
  const [deviceState, setDeviceState] = useState('any');
  const [authentication, setAuthentication] = useState<'none' | 'mfa' | 'passwordlessMfa' | 'phishingResistantMfa'>('none');
  const [authFlow, setAuthFlow] = useState<'none' | 'deviceCodeFlow' | 'authenticationTransfer'>('none');
  const [appProtection, setAppProtection] = useState<'none' | 'approvedApp' | 'managedApp' | 'both'>('none');
  const [passwordChanged, setPasswordChanged] = useState(false);

  // About dialog state
  const [aboutOpen, setAboutOpen] = useState(false);

  // Button feedback state (Fix 5)
  const [justEvaluated, setJustEvaluated] = useState(false);

  // Clear stale results helper (Fix 3)
  const clearResults = () => useEvaluationStore.getState().clear();

  // User search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
      console.error('Failed to load policies:', err);
    }
  };

  const handleLoadSampleData = () => {
    usePolicyStore.getState().loadSampleData();
    // Auto-select first persona and evaluate (Fix 6)
    usePersonaStore.getState().resolveAndCacheSample('sample-user-1');
    const persona = usePersonaStore.getState().resolvedPersonas.get('sample-user-1');
    const policies = usePolicyStore.getState().policies;
    if (persona && policies.length > 0) {
      const context: SimulationContext = {
        user: persona,
        application: { appId: 'All', displayName: 'All Cloud Apps' },
        device: {},
        location: {},
        risk: { signInRiskLevel: 'none', userRiskLevel: 'none' },
        clientAppType: 'browser',
        satisfiedControls: [],
      };
      useEvaluationStore.getState().evaluate(policies, context);
    }
  };

  // ── User search (debounced) ───────────────────────────────────────

  const showDefaultUsers = useCallback(async () => {
    if (isSampleMode) {
      const results = usePersonaStore.getState().searchSampleUsers('');
      setSearchResults(results);
      setShowResults(true);
      return;
    }
    setIsSearching(true);
    try {
      const results = await usePersonaStore.getState().fetchDefaultUsers();
      setSearchResults(results.slice(0, 10));
      setShowResults(true);
    } catch {
      // Fall back silently — user can still type to search
    } finally {
      setIsSearching(false);
    }
  }, [isSampleMode]);

  const handleSearchFocus = () => {
    if (searchQuery.length === 0) {
      showDefaultUsers();
    } else if (searchResults.length > 0) {
      setShowResults(true);
    }
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (isSampleMode) {
      const results = usePersonaStore.getState().searchSampleUsers(query);
      setSearchResults(results.slice(0, 10));
      setShowResults(results.length > 0);
      return;
    }

    // Live mode
    if (query.length < 2) {
      if (query.length === 0) showDefaultUsers();
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await usePersonaStore.getState().searchUsers(query);
        setSearchResults(results.slice(0, 10));
        setShowResults(true);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const handleSelectUser = async (user: UserSearchResult) => {
    clearResults();
    setShowResults(false);
    setSearchQuery('');
    setSearchResults([]);

    if (isSampleMode) {
      usePersonaStore.getState().resolveAndCacheSample(user.id);
      return;
    }

    try {
      await usePersonaStore.getState().resolveAndCache(user.id);
    } catch (err) {
      console.error('Failed to resolve user:', err);
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

  const handleEvaluateRef = useRef<() => void>(() => {});
  const canEvaluateRef = useRef(false);

  // Refs are updated below after handleEvaluate is defined

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canEvaluateRef.current) handleEvaluateRef.current();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Tenant-specific app options from policies ───────────────────────

  const tenantApps = useMemo(() => {
    const apps: { value: string; label: string }[] = [];
    const seen = new Set<string>();

    for (const policy of policies) {
      const allIds = [
        ...policy.conditions.applications.includeApplications,
        ...policy.conditions.applications.excludeApplications,
      ];
      for (const id of allIds) {
        if (HIDDEN_APP_IDS.has(id) || BUNDLED_APP_IDS.has(id) || seen.has(id)) continue;
        const name = displayNames.get(id);
        if (name) {
          apps.push({ value: id, label: name });
          seen.add(id);
        }
      }
    }

    apps.sort((a, b) => a.label.localeCompare(b.label));
    return apps;
  }, [policies, displayNames]);

  // ── Evaluate ──────────────────────────────────────────────────────

  const canEvaluate = policies.length > 0 && selectedPersona !== null;

  const handleEvaluate = () => {
    if (!selectedPersona) return;

    const context: SimulationContext = {
      user: selectedPersona,
      application: {
        appId,
        displayName:
          APP_BUNDLES.find((b) => b.id === appId)?.displayName
          ?? tenantApps.find((a) => a.value === appId)?.label
          ?? appId,
      },
      device: {
        platform: platform === 'any' ? undefined : (platform as DevicePlatform),
        isCompliant:
          deviceState === 'compliant' || deviceState === 'compliantAndHybrid'
            ? true
            : undefined,
        trustType:
          deviceState === 'domainJoined' || deviceState === 'compliantAndHybrid'
            ? 'hybridAzureADJoined'
            : undefined,
      },
      location: {
        isTrustedLocation:
          location === 'any' ? undefined : location === 'trusted',
      },
      risk: {
        signInRiskLevel: signInRisk,
        userRiskLevel: userRisk,
      },
      clientAppType: clientApp,
      authenticationFlow: authFlow === 'none' ? undefined : authFlow,
      authenticationStrengthLevel: deriveAuthStrengthLevel(authentication),
      satisfiedControls: deriveSatisfiedControls({ authentication, deviceState, appProtection, passwordChanged }),
    };

    evaluate(policies, context);

    // Button feedback flash (Fix 5)
    setJustEvaluated(true);
    setTimeout(() => setJustEvaluated(false), 1000);
  };

  // Keep refs current for keyboard shortcut (Fix 4)
  handleEvaluateRef.current = handleEvaluate;
  canEvaluateRef.current = canEvaluate;

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
                  className="text-xs font-normal text-blue-400 border-blue-400/50"
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
        </div>

        <Separator />

        {/* User / Persona search + Authentication */}
        <div>
          <SectionLabel icon={<User className="h-3 w-3" />} label="User" />

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
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setShowResults(false);
                  }}
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
              <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                <span>{selectedPersona.memberOfGroupIds.length} groups</span>
                <span>{selectedPersona.directoryRoleIds.length} roles</span>
              </div>
            </div>
          )}
        </div>

        {/* Authentication */}
        <div>
          <SectionLabel icon={<KeyRound className="h-3 w-3" />} label="Authentication" />
          <Select value={authentication} onValueChange={(v: 'none' | 'mfa' | 'phishingResistantMfa') => { clearResults(); setAuthentication(v); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTH_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Authentication Flow */}
        <div>
          <SectionLabel icon={<ArrowRightLeft className="h-3 w-3" />} label="Authentication Flow" />
          <Select value={authFlow} onValueChange={(v: 'none' | 'deviceCodeFlow' | 'authenticationTransfer') => { clearResults(); setAuthFlow(v); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTH_FLOW_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Application */}
        <div>
          <SectionLabel icon={<AppWindow className="h-3 w-3" />} label="Application" />
          <Select value={appId} onValueChange={(v) => { clearResults(); setAppId(v); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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

        {/* Device State */}
        <div>
          <SectionLabel icon={<Laptop className="h-3 w-3" />} label="Device State" />
          <Select value={deviceState} onValueChange={(v) => { clearResults(); setDeviceState(v); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEVICE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
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
          onClick={handleEvaluate}
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

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
  );
}
