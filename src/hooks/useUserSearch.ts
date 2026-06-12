// hooks/useUserSearch.ts — Shared debounced user search (sample + live mode).
//
// Replaces duplicated logic in ScenarioPanel and UserSearchInput. Handles the
// async hazards of live-mode search:
// - a monotonic request sequence drops stale responses (an older fetch
//   resolving after a newer one can no longer overwrite the dropdown)
// - clearing/shortening the query invalidates in-flight requests
// - pending debounce timers are cancelled on unmount

import { useState, useRef, useCallback, useEffect } from 'react';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { usePersonaStore } from '@/stores/usePersonaStore';
import type { UserSearchResult } from '@/services/personaService';

const DEBOUNCE_MS = 300;
const MAX_RESULTS = 10;

export function useUserSearch() {
  const dataSource = usePolicyStore((s) => s.dataSource);
  const isSampleMode = dataSource === 'sample';

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestSeq = useRef(0);

  // Unmount: cancel the pending debounce and invalidate in-flight requests so
  // their resolution doesn't call setState on an unmounted component
  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      requestSeq.current++;
    };
  }, []);

  const runAsyncSearch = useCallback(async (fetcher: () => Promise<UserSearchResult[]>, silent: boolean) => {
    const seq = ++requestSeq.current;
    setIsSearching(true);
    try {
      const results = await fetcher();
      if (seq !== requestSeq.current) return; // stale — a newer request superseded this one
      setSearchResults(results.slice(0, MAX_RESULTS));
      setShowResults(true);
    } catch (err) {
      if (!silent && seq === requestSeq.current) {
        console.error('Search failed:', err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      if (seq === requestSeq.current) setIsSearching(false);
    }
  }, []);

  const showDefaultUsers = useCallback(() => {
    if (isSampleMode) {
      setSearchResults(usePersonaStore.getState().searchSampleUsers(''));
      setShowResults(true);
      return;
    }
    void runAsyncSearch(() => usePersonaStore.getState().fetchDefaultUsers(), true);
  }, [isSampleMode, runAsyncSearch]);

  const handleFocus = useCallback(() => {
    if (searchQuery.length === 0) {
      showDefaultUsers();
    } else if (searchResults.length > 0) {
      setShowResults(true);
    }
  }, [searchQuery, searchResults, showDefaultUsers]);

  const handleChange = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    // Anything in flight is for an outdated query
    requestSeq.current++;

    if (isSampleMode) {
      const results = usePersonaStore.getState().searchSampleUsers(query);
      setSearchResults(results.slice(0, MAX_RESULTS));
      setShowResults(results.length > 0);
      return;
    }

    // Live mode
    if (query.length < 2) {
      if (query.length === 0) {
        showDefaultUsers();
      } else {
        // Don't keep showing results from the previous longer query
        setSearchResults([]);
        setShowResults(false);
        setIsSearching(false);
      }
      return;
    }

    searchTimeout.current = setTimeout(() => {
      void runAsyncSearch(() => usePersonaStore.getState().searchUsers(query), false);
    }, DEBOUNCE_MS);
  }, [isSampleMode, showDefaultUsers, runAsyncSearch]);

  /** Clear the query, results, and any pending/in-flight search. */
  const reset = useCallback(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    requestSeq.current++;
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
    setIsSearching(false);
  }, []);

  return {
    isSampleMode,
    searchQuery,
    searchResults,
    isSearching,
    showResults,
    setShowResults,
    handleFocus,
    handleChange,
    reset,
  };
}
