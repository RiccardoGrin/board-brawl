import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { cn } from '../../utils/cn';
import {
  CACHE_RESULT_THRESHOLD,
  DEFAULT_RESULT_CAP,
  STALENESS_MS,
  type GameRecord,
  normalizeGameName,
  searchGamesCache,
  searchGamesRemote,
  refreshGameIfStale,
  isGameStale,
  convertBoxDimensionsToMm,
} from '../../services/gameSearch';
import type { GameMeta } from '../../types/tournament';
import { SelectedGameCard } from './selected-game-card';

/**
 * Value emitted when a game is selected from the dropdown.
 * Contains the display name plus optional canonical identifiers and metadata snapshot.
 */
export type GameInputValue = {
  /** Display name of the game */
  name: string;
  /** Internal game record ID (if selected from cache/remote) */
  gameId?: string;
  /** External source identifiers (e.g., BGG ID) */
  sourceIds?: { bgg?: string };
  /** Metadata snapshot (player count, playtime, etc.) */
  meta?: GameMeta;
};

interface GameInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: GameInputValue) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  /** Show selected game as a card (with thumbnail and clear button) when game is selected */
  showSelectedCard?: boolean;
  /** Currently selected game metadata (required when showSelectedCard is true) */
  selectedGame?: GameInputValue | null;
  /** Set of game IDs that the user owns (shows "Owned" badge in dropdown) */
  ownedGameIds?: Set<string>;
}

type FetchState = 'idle' | 'loading-cache' | 'loading-remote';

// Timing constants optimized to prevent excessive BGG API calls while maintaining good UX
const REMOTE_DELAY_MS = 1200; // Wait 1200ms after cache before calling BGG (gives users time to finish typing)
const CACHE_DEBOUNCE_MS = 300; // Wait 300ms after typing stops before searching cache
const MIN_REMOTE_LEN = 3; // Require at least 3 characters before calling BGG API
const REMOTE_COOLDOWN_MS = 2000; // Minimum 2 seconds between BGG API calls (BGG rate limit is 5.5s, this provides buffer)
const DISABLE_REMOTE = false; // Remote search enabled with BGG API token

const scoreResult = (item: GameRecord, normalizedQuery: string) => {
  const name = normalizeGameName(item.primaryName);
  const idx = name.indexOf(normalizedQuery);
  const isPrefix = idx === 0;
  const hasSubstring = idx > 0;
  const popularity = item.rating ?? item.bayesAverage ?? 0;
  const recencyBoost = item.fetchedAt ? 1 / (1 + (Date.now() - new Date(item.fetchedAt).getTime()) / STALENESS_MS) : 0;
  return (isPrefix ? 3 : 0) + (hasSubstring ? 1 : 0) + popularity / 100 + recencyBoost;
};

export function GameInput({
  value,
  onChange,
  onSelect,
  placeholder = 'Search board games',
  className,
  disabled = false,
  autoFocus = false,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  showSelectedCard = true,
  selectedGame = null,
  ownedGameIds,
}: GameInputProps) {
  const [suggestions, setSuggestions] = useState<GameRecord[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [hasCacheResults, setHasCacheResults] = useState<boolean>(false);
  const [lastCacheCount, setLastCacheCount] = useState<number>(0);
  const remoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQuery = useRef<string>('');
  const lastRemoteQuery = useRef<string | null>(null);
  const lastRemoteAt = useRef<number>(0);
  const remoteInFlight = useRef<boolean>(false);
  const componentActive = useRef(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [hasFocus, setHasFocus] = useState(false);
  const skipNextFetch = useRef(false);

  const normalizedQuery = useMemo(() => normalizeGameName(value || ''), [value]);

  // Determine if we should show the selected card
  const shouldShowCard = showSelectedCard && selectedGame && (selectedGame.gameId || selectedGame.sourceIds?.bgg);

  // Handler for clearing the selected game
  const handleClearSelection = () => {
    onChange('');
    if (onSelect) {
      onSelect({ name: '' });
    }
    // Focus the input after clearing
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  useEffect(() => {
    // Reset active flag (especially after HMR / remounts)
    componentActive.current = true;
    return () => {
      componentActive.current = false;
      if (remoteTimer.current) clearTimeout(remoteTimer.current);
      if (cacheTimer.current) clearTimeout(cacheTimer.current);
    };
  }, []);

  // Ensure dropdown opens whenever we have suggestions
  useEffect(() => {
    if (suggestions.length > 0 && hasFocus) {
      setIsOpen(true);
    } else if (!hasFocus) {
      setIsOpen(false);
    }
  }, [suggestions.length, hasFocus]);

  useEffect(() => {
    if (cacheTimer.current) clearTimeout(cacheTimer.current);
    const trimmed = value.trim();
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    if (!trimmed) {
      setSuggestions([]);
      setIsOpen(false);
      setFetchState('idle');
      return;
    }

    cacheTimer.current = setTimeout(async () => {
      // Clear any pending remote search from previous queries
      if (remoteTimer.current) {
        clearTimeout(remoteTimer.current);
        remoteTimer.current = null;
      }
      
      setFetchState('loading-cache');
      latestQuery.current = value;
      
      try {
        const cacheResults = await searchGamesCache(normalizedQuery, DEFAULT_RESULT_CAP);
        if (!componentActive.current) return;

        let ranked: GameRecord[] = [];
        try {
          ranked = cacheResults
            .map((r) => ({ r, score: scoreResult(r, normalizedQuery) }))
            .sort((a, b) => b.score - a.score)
            .map((x) => x.r)
            .slice(0, DEFAULT_RESULT_CAP);
        } catch (rankErr) {
          throw rankErr;
        }

        setSuggestions(ranked);
        setIsOpen(hasFocus);
        setFetchState('idle');
        setLastCacheCount(cacheResults.length);
        setHasCacheResults(cacheResults.length > 0);

        // If we have enough good cache results (with images), skip remote
        // Otherwise, fetch from BGG to get images and fresh data
        // Check ALL results have thumbnails, not just the first few
        const allHaveThumbnails = ranked.every(g => g.thumbnail);
        const hasEnoughQualityResults = ranked.length >= CACHE_RESULT_THRESHOLD && allHaveThumbnails;

        if (hasEnoughQualityResults) {
          return; // We have good cached results with images, no need for remote
        }
        
        // Schedule remote search to get images and fresh data
        // Results will be APPENDED to existing suggestions, not replaced
        if (!DISABLE_REMOTE && trimmed.length >= MIN_REMOTE_LEN) {
          if (remoteTimer.current) clearTimeout(remoteTimer.current);
          remoteTimer.current = setTimeout(() => runRemote(trimmed), REMOTE_DELAY_MS);
        }
      } catch (err: any) {
        if (!componentActive.current) return;
        setFetchState('idle');
        console.debug('Cache search failed:', err);
      }
    }, CACHE_DEBOUNCE_MS);
  }, [value, normalizedQuery]);

  // Fallback: if cache returns nothing and query is non-empty, ensure we attempt remote at least once
  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!DISABLE_REMOTE && !hasCacheResults && lastCacheCount === 0 && trimmed.length >= MIN_REMOTE_LEN) {
      const now = Date.now();
      if (lastRemoteQuery.current === trimmed && now - lastRemoteAt.current < REMOTE_COOLDOWN_MS) return;
      lastRemoteQuery.current = trimmed;
      void runRemote(trimmed);
    }
  }, [lastCacheCount, value, hasCacheResults]);

  const runRemote = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (DISABLE_REMOTE) return;
    if (!trimmed || trimmed.length < MIN_REMOTE_LEN) return;
    const now = Date.now();
    if (remoteInFlight.current || now - lastRemoteAt.current < REMOTE_COOLDOWN_MS) {
      return;
    }
    remoteInFlight.current = true;
    setFetchState('loading-remote');
    
    try {
      const remote = await searchGamesRemote(trimmed, DEFAULT_RESULT_CAP);
      lastRemoteAt.current = Date.now();
      if (!componentActive.current || latestQuery.current !== trimmed) return;

      // Use functional setState to get latest suggestions state
      setSuggestions(currentSuggestions => {
        // Keep existing suggestions at the top and append new results from BGG
        // This prevents jarring replacement of what user is already viewing
        const existingBggIds = new Set(
          currentSuggestions.map(s => s.sourceIds?.bgg).filter(Boolean)
        );
        
        // Filter out duplicates (games already in suggestions)
        const newResults = remote.results.filter(
          r => r.sourceIds?.bgg && !existingBggIds.has(r.sourceIds.bgg)
        );
        
        // Append new results to the end (no sorting/reordering)
        return [...currentSuggestions, ...newResults];
      });
      
      setIsOpen(hasFocus);
    } catch (err: any) {
      if (!componentActive.current) return;
      // Don't permanently disable remote - just show cache results
      // Remote will retry on next search if cache is insufficient
      console.error('BGG remote search failed:', err);
    } finally {
      setFetchState('idle');
      remoteInFlight.current = false;
    }
  };

  const selectSuggestion = (s: GameRecord) => {
    skipNextFetch.current = true;
    onChange(s.primaryName);

    // Convert box dimensions from inches (BGG format) to mm (storage format)
    const boxDimensions = convertBoxDimensionsToMm(s);

    // Optimistically show cached data immediately
    const currentMeta: GameMeta = {
      minPlayers: s.minPlayers,
      maxPlayers: s.maxPlayers,
      minPlaytime: s.minPlaytime,
      maxPlaytime: s.maxPlaytime,
      playingTime: s.playingTime,
      thumbnail: s.thumbnail,
      year: s.year,
      ...boxDimensions,
      // Include focal point from games collection if set by admin
      focalPointX: s.focalPointX,
      focalPointY: s.focalPointY,
    };

    onSelect?.({
      name: s.primaryName,
      gameId: s.gameId,
      sourceIds: s.sourceIds,
      meta: currentMeta,
    });
    
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.blur();
    
    // Refresh stale games in background (> 30 days old or missing data)
    if (s.sourceIds?.bgg && isGameStale(s)) {
      void (async () => {
        try {
          await refreshGameIfStale(s.sourceIds.bgg);
        } catch (err) {
          console.error('Background game refresh failed:', err);
        }
      })();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || !suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        selectSuggestion(suggestions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div className="relative z-[120]">
      {/* Show selected game card if a game is selected and has proper ID */}
      {shouldShowCard ? (
        <SelectedGameCard
          name={selectedGame.name}
          thumbnail={selectedGame.meta?.thumbnail}
          year={selectedGame.meta?.year}
          onClear={handleClearSelection}
          disabled={disabled}
          className={className}
        />
      ) : (
        /* Show search input when no game is selected or game lacks ID */
        <div className="relative">
          <input
            type="text"
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
              setHasFocus(true);
              if (suggestions.length) setIsOpen(true);
            }}
            onBlur={() => {
              setHasFocus(false);
              setIsOpen(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            aria-label={ariaLabel}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            className={cn(
              'h-14 text-base w-full bg-paper/70 px-4 pr-10',
              'border rounded focus:outline-none focus:ring-2 focus:ring-gold/50',
              ariaInvalid ? 'border-red-300' : 'border-gold-2/30 focus:border-gold',
              disabled && 'opacity-50 cursor-not-allowed',
              className,
            )}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {fetchState === 'loading-cache' && <Search className="w-4 h-4 text-muted" />}
            {fetchState === 'loading-remote' && <Loader2 className="w-4 h-4 text-muted animate-spin" />}
          </div>
        </div>
      )}

      {/* Only show dropdown when not showing the selected card */}
      {isOpen && !shouldShowCard && (
        <div
          role="listbox"
          className={cn(
            'absolute left-0 right-0 top-full mt-1 z-[130] bg-white shadow-main rounded',
            'max-h-80 flex flex-col',
          )}
        >
          {/* Scrollable content area */}
          <div
            className={cn(
              'overflow-y-auto divide-y divide-border-2 flex-1',
              '[&::-webkit-scrollbar]:w-1.5',
              '[&::-webkit-scrollbar-thumb]:rounded-full',
              '[&::-webkit-scrollbar-thumb]:bg-gold-2/50',
              '[&::-webkit-scrollbar-track]:bg-transparent',
            )}
            style={{ scrollbarWidth: 'thin' }}
          >
            {suggestions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted">No results found</div>
            ) : (
              suggestions.map((s, idx) => {
                const isActive = idx === highlightedIndex;
                const isOwned = s.gameId && ownedGameIds?.has(s.gameId);
                return (
                  <button
                    key={s.gameId ?? s.sourceIds?.bgg ?? `${s.primaryName}-${idx}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectSuggestion(s)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    role="option"
                    aria-selected={isActive}
                    className={cn(
                      'w-full px-4 py-3 text-left flex items-center gap-3 transition-colors',
                      isActive ? 'bg-gold-2/10' : 'hover:bg-gold-2/10',
                    )}
                  >
                    {s.thumbnail ? (
                      <img
                        src={s.thumbnail}
                        alt=""
                        className="w-10 h-10 rounded object-cover border border-border-2"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gold/10 border border-gold-2/40 flex items-center justify-center text-sm font-bold text-gold">
                        {s.primaryName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-ink text-sm truncate">{s.primaryName}</div>
                      <div className="text-xs text-muted flex items-center gap-2">
                        {s.year && <span>{s.year}</span>}
                      </div>
                    </div>
                    {isOwned && (
                      <span className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded bg-green/10 text-green border border-green/20">
                        Owned
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          
          {/* Sticky footer section */}
          <div className="border-t border-border-2 bg-white">
            {fetchState === 'loading-remote' && (
              <div className="px-4 py-2 flex items-center justify-center gap-2 text-sm text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading more results...</span>
              </div>
            )}
            <div className="px-4 py-2 text-[11px] text-muted flex justify-end">
              <a
                href="https://boardgamegeek.com"
                target="_blank"
                rel="noreferrer"
                className="text-blue-700 hover:underline"
              >
                Powered by BGG
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Error messages removed - failures are handled gracefully by falling back to cache */}
    </div>
  );
}

