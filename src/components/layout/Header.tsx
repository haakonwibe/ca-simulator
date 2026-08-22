import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { usePersonaStore } from '@/stores/usePersonaStore';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import type { SimulationContext } from '@/engine/models/SimulationContext';
import { COLORS, APP_VERSION } from '@/data/theme';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AboutDialog } from '@/components/AboutDialog';
import { LimitationsDialog } from '@/components/LimitationsDialog';
import { ResultsTipsDialog } from '@/components/ResultsTipsDialog';
import { ReleaseNotesDialog } from '@/components/ReleaseNotesDialog';
import { AuthErrorBanner } from '@/components/AuthErrorBoundary';
import { LogIn, LogOut, User, ChevronDown, FlaskConical, FileText, HelpCircle, AlertTriangle, Info, Loader2, Globe, Check, Github, Coffee, Beaker } from 'lucide-react';

export function Header() {
  const accounts = useAuthStore((s) => s.accounts);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const account = accounts[0];
  const dataSource = usePolicyStore((s) => s.dataSource);
  const tenantName = usePolicyStore((s) => s.tenantName);
  const isLoading = usePolicyStore((s) => s.isLoading);
  const sandboxActive = usePolicyStore((s) => s.sandboxActive);
  const setSandboxActive = usePolicyStore((s) => s.setSandboxActive);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [limitationsOpen, setLimitationsOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const loadTenantName = usePolicyStore((s) => s.loadTenantName);

  // Fetch tenant name on page refresh when already authenticated
  useEffect(() => {
    if (isAuthenticated && account && !tenantName && dataSource !== 'sample') {
      loadTenantName().catch(() => {});
    }
  }, [isAuthenticated, account, tenantName, dataSource, loadTenantName]);

  const handleLogin = () => {
    login().catch(console.error);
  };

  const handleLogout = () => {
    logout().catch(console.error);
  };

  const switchToSample = () => {
    useEvaluationStore.getState().clear();
    usePersonaStore.getState().clear();
    usePolicyStore.getState().loadSampleData();
    usePersonaStore.getState().resolveAndCacheSample('sample-user-1');
    const persona = usePersonaStore.getState().resolvedPersonas.get('sample-user-1');
    const policies = usePolicyStore.getState().effectivePolicies;
    if (persona && policies.length > 0) {
      const context: SimulationContext = {
        user: persona,
        application: { appId: 'All', displayName: 'All Cloud Apps' },
        device: {},
        location: {},
        clientAppType: 'browser',
        risk: { signInRiskLevel: 'none', userRiskLevel: 'none', insiderRiskLevel: 'none' },
        satisfiedControls: [],
      };
      useEvaluationStore.getState().evaluate(policies, context, 'auto');
    }
  };

  const switchToLive = async () => {
    if (!isAuthenticated) {
      login().catch(console.error);
      return;
    }
    useEvaluationStore.getState().clear();
    usePersonaStore.getState().clear();
    try {
      await usePolicyStore.getState().loadFromGraph();
    } catch (err) {
      console.error('Failed to load policies:', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <>
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      {/* Left: Logo + icons */}
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold tracking-tight">
          <span className="text-primary">CA</span>{' '}
          <span className="text-foreground">Simulator</span>
        </span>
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-5 font-normal"
          style={{ color: COLORS.textMuted, borderColor: COLORS.border }}
        >
          {APP_VERSION}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setReleaseNotesOpen(true)}
          title="Release notes"
          aria-label="Release notes"
        >
          <FileText className="h-3.5 w-3.5" style={{ color: COLORS.textMuted }} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setAboutOpen(true)}
          title="What is this?"
          aria-label="What is this?"
        >
          <HelpCircle className="h-3.5 w-3.5" style={{ color: COLORS.textMuted }} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setTipsOpen(true)}
          title="Understanding your results"
          aria-label="Understanding your results"
        >
          <Info className="h-3.5 w-3.5" style={{ color: COLORS.textMuted }} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setLimitationsOpen(true)}
          title="Known limitations"
          aria-label="Known limitations"
        >
          <AlertTriangle className="h-3.5 w-3.5" style={{ color: COLORS.textMuted }} />
        </Button>
        <a
          href="https://buymeacoffee.com/haakonwibe"
          target="_blank"
          rel="noopener noreferrer"
          title="Buy me a coffee"
          aria-label="Buy me a coffee"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
        >
          <Coffee className="h-3.5 w-3.5" style={{ color: COLORS.textMuted }} />
        </a>
      </div>

      {/* Center: Data source toggle */}
      <div className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isLoading}>
            <button className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-normal transition-colors hover:bg-accent/50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              style={{ borderColor: dataSource === 'sample' ? COLORS.accentLightFaded : COLORS.border }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" style={{ color: COLORS.textMuted }} />
                  <span style={{ color: COLORS.textMuted }}>Loading...</span>
                </>
              ) : dataSource === 'sample' ? (
                <>
                  <FlaskConical className="h-3 w-3" style={{ color: COLORS.accentLight }} />
                  <span style={{ color: COLORS.accentLight }}>Demo Mode</span>
                </>
              ) : tenantName ? (
                <>
                  <Globe className="h-3 w-3" style={{ color: COLORS.textMuted }} />
                  <span>{tenantName}</span>
                </>
              ) : (
                <span style={{ color: COLORS.textMuted }}>Not connected</span>
              )}
              <ChevronDown className="h-3 w-3" style={{ color: COLORS.textMuted }} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onClick={switchToSample} className="gap-2 text-xs">
              <FlaskConical className="h-3.5 w-3.5" />
              Sample Data
              {dataSource === 'sample' && <Check className="h-3.5 w-3.5 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={switchToLive} className="gap-2 text-xs">
              <Globe className="h-3.5 w-3.5" />
              {isAuthenticated ? 'Load from Tenant' : 'Sign in to Tenant'}
              {dataSource === 'live' && <Check className="h-3.5 w-3.5 ml-auto" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sandbox mode switch — only meaningful once policies are loaded */}
        {dataSource !== 'none' && (
          <div className="ml-3 flex items-center gap-1.5">
            <Switch
              id="sandbox-switch"
              checked={sandboxActive}
              onCheckedChange={setSandboxActive}
              aria-label="Toggle sandbox mode"
            />
            <label
              htmlFor="sandbox-switch"
              className="flex cursor-pointer items-center gap-1 text-xs"
              style={{ color: sandboxActive ? COLORS.warning : COLORS.textMuted }}
            >
              <Beaker className="h-3 w-3" />
              Sandbox
            </label>
          </div>
        )}
      </div>

      {/* Right: GitHub + Auth button */}
      <div className="flex items-center gap-1">
        <a
          href="https://github.com/haakonwibe/ca-simulator"
          target="_blank"
          rel="noopener noreferrer"
          title="View source on GitHub"
          aria-label="View source on GitHub"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
        >
          <Github className="h-4 w-4" style={{ color: COLORS.textMuted }} />
        </a>
        {isAuthenticated && account ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 text-sm">
                <User className="h-4 w-4" />
                {account.name ?? account.username}
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleLogout} className="gap-2">
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="outline" size="sm" onClick={handleLogin} className="gap-2">
            <LogIn className="h-4 w-4" />
            Sign in
          </Button>
        )}
      </div>

      <ReleaseNotesDialog open={releaseNotesOpen} onOpenChange={setReleaseNotesOpen} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <ResultsTipsDialog open={tipsOpen} onOpenChange={setTipsOpen} />
      <LimitationsDialog open={limitationsOpen} onOpenChange={setLimitationsOpen} />
    </header>
    <AuthErrorBanner />
    </>
  );
}
