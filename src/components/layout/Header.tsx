import { useState, useEffect } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { loginRequest } from '@/authConfig';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { usePersonaStore } from '@/stores/usePersonaStore';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import type { SimulationContext } from '@/engine/models/SimulationContext';
import { COLORS } from '@/data/theme';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { LogIn, LogOut, User, ChevronDown, FlaskConical, FileText, HelpCircle, AlertTriangle, Info, Loader2, Globe, Check } from 'lucide-react';

export function Header() {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const account = accounts[0];
  const dataSource = usePolicyStore((s) => s.dataSource);
  const tenantName = usePolicyStore((s) => s.tenantName);
  const isLoading = usePolicyStore((s) => s.isLoading);
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
    instance.loginRedirect(loginRequest).catch(console.error);
  };

  const handleLogout = () => {
    instance.logoutRedirect().catch(console.error);
  };

  const switchToSample = () => {
    useEvaluationStore.getState().clear();
    usePersonaStore.getState().clear();
    usePolicyStore.getState().loadSampleData();
    usePersonaStore.getState().resolveAndCacheSample('sample-user-1');
    const persona = usePersonaStore.getState().resolvedPersonas.get('sample-user-1');
    const policies = usePolicyStore.getState().policies;
    if (persona && policies.length > 0) {
      const context: SimulationContext = {
        user: persona,
        application: { appId: 'All', displayName: 'All Cloud Apps' },
        device: {},
        location: {},
        clientAppType: 'browser',
        risk: { signInRiskLevel: 'none', userRiskLevel: 'none' },
        satisfiedControls: [],
      };
      useEvaluationStore.getState().evaluate(policies, context);
    }
  };

  const switchToLive = async () => {
    if (!isAuthenticated) {
      instance.loginRedirect(loginRequest).catch(console.error);
      return;
    }
    useEvaluationStore.getState().clear();
    usePersonaStore.getState().clear();
    try {
      await usePolicyStore.getState().loadFromGraph();
    } catch (err) {
      console.error('Failed to load policies:', err);
    }
  };

  return (
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
          v0.3 beta
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setReleaseNotesOpen(true)}
          title="Release notes"
        >
          <FileText className="h-3.5 w-3.5" style={{ color: COLORS.textMuted }} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setAboutOpen(true)}
          title="What is this?"
        >
          <HelpCircle className="h-3.5 w-3.5" style={{ color: COLORS.textMuted }} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setTipsOpen(true)}
          title="Understanding your results"
        >
          <Info className="h-3.5 w-3.5" style={{ color: COLORS.textMuted }} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setLimitationsOpen(true)}
          title="Known limitations"
        >
          <AlertTriangle className="h-3.5 w-3.5" style={{ color: COLORS.textMuted }} />
        </Button>
      </div>

      {/* Center: Data source toggle */}
      <div className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isLoading}>
            <button className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-normal transition-colors hover:bg-accent/50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              style={{ borderColor: dataSource === 'sample' ? 'rgba(96,165,250,0.5)' : COLORS.border }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" style={{ color: COLORS.textMuted }} />
                  <span style={{ color: COLORS.textMuted }}>Loading...</span>
                </>
              ) : dataSource === 'sample' ? (
                <>
                  <FlaskConical className="h-3 w-3 text-blue-400" />
                  <span className="text-blue-400">Demo Mode</span>
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
      </div>

      {/* Right: Auth button */}
      <div className="flex items-center">
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
  );
}
