// components/UserSearchInput.tsx — Reusable user search with debounced typeahead.
// Self-contained: manages own search state, delegates resolution to parent via onSelect.

import { useRef, useEffect } from 'react';
import { useUserSearch } from '@/hooks/useUserSearch';
import type { UserSearchResult } from '@/services/personaService';
import { COLORS } from '@/data/theme';

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, X } from 'lucide-react';

interface UserSearchInputProps {
  onSelect: (user: UserSearchResult) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Override the input sizing classes (e.g. compact contexts like the assignment editor) */
  inputClassName?: string;
}

export function UserSearchInput({ onSelect, placeholder, disabled, inputClassName }: UserSearchInputProps) {
  const {
    isSampleMode,
    searchQuery,
    searchResults,
    isSearching,
    showResults,
    setShowResults,
    handleFocus,
    handleChange,
    reset,
  } = useUserSearch();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = (user: UserSearchResult) => {
    reset();
    onSelect(user);
  };

  // Outside-click to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={placeholder ?? (isSampleMode ? 'Search sample users...' : 'Search users...')}
          value={searchQuery}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (!disabled) handleFocus(); }}
          className={inputClassName ?? 'h-8 pl-8 pr-8 text-xs'}
          disabled={disabled}
        />
        {isSearching && (
          <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {searchQuery && !isSearching && (
          <button
            onClick={reset}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Search results dropdown */}
      {showResults && searchResults.length > 0 && (
        <div role="listbox" aria-label="User search results" className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          {searchResults.map((user) => (
            <button
              role="option"
              key={user.id}
              onClick={() => handleSelect(user)}
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
  );
}
