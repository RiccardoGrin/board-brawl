import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAt,
  endAt,
  where,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const GAMES_COLLECTION = collection(db, 'games');
const RESULT_CAP = 8;
const STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MIN_CACHE_RESULTS = 3;

export type GameRank = {
  id: string;
  name: string;
  value: string;
  bayes?: string;
};

export type GameRecord = {
  gameId: string;
  primaryName: string;
  altNames: string[];
  normalized: string;
  sourceIds: { bgg: string };
  sources: string[];
  year?: number;
  minPlayers?: number;
  maxPlayers?: number;
  minPlaytime?: number;
  maxPlaytime?: number;
  playingTime?: number;
  designers: string[];
  publishers: string[];
  categories: string[];
  mechanics: string[];
  image?: string;
  thumbnail?: string;
  additionalImages?: string[]; // BGG image IDs for gallery images
  rulesFiles?: Array<{ id: string; name: string }>; // Rules PDFs and files
  boxWidthInches?: number; // Box dimensions in imperial units (BGG API standard)
  boxLengthInches?: number;
  boxDepthInches?: number;
  boxWeightLbs?: number;
  rating?: number;
  bayesAverage?: number;
  ranks: GameRank[];
  fetchedAt: string;
  // Thumbnail focal point for shelf display (0-100%, defaults to 50)
  focalPointX?: number;
  focalPointY?: number;
};

export type GameSuggestion = {
  name: string;
  gameId?: string;
  sourceIds?: { bgg?: string };
  thumbnail?: string;
  year?: number;
  rating?: number;
};

export type BggResult = Omit<GameRecord, 'gameId' | 'normalized'> & { normalized?: string };

/** Normalizes game names for consistent searching (trim + lowercase) */
const normalizeName = (value: string) => value.trim().toLowerCase();

/** Maps BGG API result to our GameRecord format */
const mapBggToRecord = (result: BggResult): Omit<GameRecord, 'gameId'> => {
  const normalized = result.normalized ?? normalizeName(result.primaryName);
  return {
    ...result,
    normalized,
  };
};

/** 
 * Merges existing cached game data with fresh BGG data.
 * Deduplicates arrays (designers, publishers, etc.) and preserves gameId.
 */
const mergeRecord = (existing: GameRecord | null, incoming: BggResult): GameRecord => {
  const base = existing ?? {
    gameId: crypto.randomUUID(),
    normalized: normalizeName(incoming.primaryName),
    primaryName: incoming.primaryName,
    altNames: [],
    sourceIds: { bgg: incoming.sourceIds.bgg },
    sources: ['bgg'],
    designers: [],
    publishers: [],
    categories: [],
    mechanics: [],
    ranks: [],
    fetchedAt: new Date().toISOString(),
  };

  const mapped = mapBggToRecord(incoming);

  return {
    ...base,
    ...mapped,
    altNames: Array.from(new Set([...(base.altNames || []), ...(mapped.altNames || [])])),
    sources: Array.from(new Set([...(base.sources || []), ...(mapped.sources || [])])),
    sourceIds: { ...base.sourceIds, ...mapped.sourceIds },
    designers: Array.from(new Set([...(base.designers || []), ...(mapped.designers || [])])),
    publishers: Array.from(new Set([...(base.publishers || []), ...(mapped.publishers || [])])),
    categories: Array.from(new Set([...(base.categories || []), ...(mapped.categories || [])])),
    mechanics: Array.from(new Set([...(base.mechanics || []), ...(mapped.mechanics || [])])),
    ranks: mapped.ranks ?? base.ranks ?? [],
    fetchedAt: mapped.fetchedAt ?? base.fetchedAt,
  };
};

/**
 * Searches the local Firestore cache for games.
 * Uses an extended prefix strategy to match BGG's CONTAINS behavior:
 * - Fetches games with a shorter prefix (first 2-3 chars)
 * - Filters client-side for games that contain the full query
 * - Returns up to `cap` results, prioritizing exact matches
 * 
 * This approach allows us to find games like "Merchants of Carcassonne" 
 * when searching for "carc", matching BGG's behavior.
 */
export const searchGamesCache = async (normalizedQuery: string, cap = RESULT_CAP): Promise<GameRecord[]> => {
  if (!normalizedQuery) return [];
  
  // For short queries (1-2 chars), use exact prefix matching
  if (normalizedQuery.length <= 2) {
    const q = query(
      GAMES_COLLECTION,
      orderBy('normalized'),
      startAt(normalizedQuery),
      endAt(`${normalizedQuery}\uf8ff`),
      limit(cap),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...(d.data() as GameRecord), gameId: d.id }));
  }
  
  // For longer queries (3+ chars), use extended prefix + client-side filtering
  // This mimics BGG's CONTAINS behavior while working within Firestore constraints
  const prefixLength = normalizedQuery.length >= 4 ? 3 : 2;
  const searchPrefix = normalizedQuery.substring(0, prefixLength);
  
  // Fetch more results (up to 100) to account for client-side filtering
  const extendedLimit = Math.min(100, cap * 12);
  
  const q = query(
    GAMES_COLLECTION,
    orderBy('normalized'),
    startAt(searchPrefix),
    endAt(`${searchPrefix}\uf8ff`),
    limit(extendedLimit),
  );
  
  const snap = await getDocs(q);
  const allDocs = snap.docs.map((d) => ({ ...(d.data() as GameRecord), gameId: d.id }));
  
  // Client-side filter: keep only games that contain the full query string
  // Check both primaryName and altNames for matches
  const filtered = allDocs.filter((game) => {
    const normalizedPrimary = game.normalized || normalizeName(game.primaryName);
    if (normalizedPrimary.includes(normalizedQuery)) return true;
    
    // Also check alternative names
    if (game.altNames?.length) {
      return game.altNames.some((altName) => 
        normalizeName(altName).includes(normalizedQuery)
      );
    }
    
    return false;
  });
  
  // Return top results (caller will rank/sort as needed)
  return filtered.slice(0, cap * 2); // Return 2x cap for ranking flexibility
};

/** Finds a game in Firestore by its BGG ID */
const findByBggId = async (bggId: string): Promise<GameRecord | null> => {
  const q = query(GAMES_COLLECTION, where('sourceIds.bgg', '==', bggId), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { ...(docSnap.data() as GameRecord), gameId: docSnap.id };
};

/** Gets the BGG cloud function URL from environment variables */
const getFunctionsUrl = () => {
  const region = import.meta.env.VITE_FUNCTIONS_REGION || 'us-central1';
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const explicit = import.meta.env.VITE_BGG_SEARCH_URL;
  if (explicit) return explicit;
  if (projectId) {
    return `https://${region}-${projectId}.cloudfunctions.net/bggSearch`;
  }
  throw new Error('Missing VITE_BGG_SEARCH_URL or VITE_FIREBASE_PROJECT_ID for bggSearch');
};

/**
 * Searches for games via BGG cloud function.
 * Calls BGG API and returns formatted results.
 */
export async function fetchBggSearch(queryText: string, cap = RESULT_CAP): Promise<BggResult[]> {
  const url = new URL(getFunctionsUrl());
  url.searchParams.set('q', queryText);
  url.searchParams.set('limit', String(cap));

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    throw new Error(`bggSearch failed: ${resp.status}`);
  }
  const data = await resp.json();
  return (data?.results as BggResult[]) ?? [];
}

/**
 * Fetches fresh data for a single game from BGG API by BGG ID.
 * This is used when a game is selected and needs to be refreshed.
 * 
 * @param bggId - The BoardGameGeek ID for the game
 * @returns A single game record with fresh data
 */
export async function fetchBggGameById(bggId: string): Promise<BggResult | null> {
  const region = import.meta.env.VITE_FUNCTIONS_REGION || 'us-central1';
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const explicit = import.meta.env.VITE_BGG_THING_URL;
  
  let functionsUrl: string;
  if (explicit) {
    functionsUrl = explicit;
  } else if (projectId) {
    functionsUrl = `https://${region}-${projectId}.cloudfunctions.net/bggThing`;
  } else {
    throw new Error('Missing VITE_BGG_THING_URL or VITE_FIREBASE_PROJECT_ID for bggThing');
  }
  
  const url = new URL(functionsUrl);
  url.searchParams.set('id', bggId);

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    throw new Error(`bggThing failed: ${resp.status}`);
  }
  const data = await resp.json();
  return data?.game ?? null;
}

/**
 * Upserts BGG search results into Firestore /games collection.
 * Merges with existing data and handles per-game errors gracefully.
 * Guest users skip caching (returns empty array).
 */
export async function upsertBggResults(results: BggResult[]): Promise<GameRecord[]> {
  const upserted: GameRecord[] = [];
  const errors: Array<{ game: string; error: string }> = [];

  // Guest users don't write to shared /games collection
  if (!auth.currentUser) {
    console.debug('Skipping game cache write: user not authenticated (guest mode)');
    return [];
  }

  for (const result of results) {
    try {
      const existing = await findByBggId(result.sourceIds.bgg);
      const merged = mergeRecord(existing, result);
      const targetDoc = doc(GAMES_COLLECTION, merged.gameId);
      
      // Remove gameId from the document data (it's stored as the document ID, not as a field)
      const { gameId, ...dataToWrite } = merged;
      
      await setDoc(targetDoc, dataToWrite, { merge: true });
      upserted.push(merged);
    } catch (err: any) {
      // Log permission errors at debug level (expected in some cases)
      // Log other errors at error level (unexpected issues)
      const errorCode = err?.code;
      if (errorCode === 'permission-denied' || err.message?.includes('insufficient permissions')) {
        console.debug(`Game "${result.primaryName}" not cached: ${err.message}`);
      } else {
        console.error(`Failed to save game "${result.primaryName}" to Firestore:`, err.message);
      }
      errors.push({ game: result.primaryName, error: err.message });
      // Continue with other games even if one fails
    }
  }

  // Don't throw on partial failures - return whatever succeeded
  // This allows searches to work even if caching fails
  return upserted;
}

/**
 * Updates a game's focal point in the shared /games collection.
 * Admin-only function to set default focal point for all users.
 */
export async function updateGameFocalPoint(
  gameId: string,
  focalPointX: number,
  focalPointY: number
): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('Must be authenticated to update game focal point');
  }

  const targetDoc = doc(GAMES_COLLECTION, gameId);
  await setDoc(
    targetDoc,
    {
      focalPointX,
      focalPointY,
    },
    { merge: true }
  );
}

/** Searches games via BGG API only (skips cache) */
export async function searchGamesRemote(queryText: string, cap = RESULT_CAP) {
  const trimmed = queryText.trim();
  if (!trimmed) return { results: [] as GameRecord[], remoteUsed: false };

  const remoteResults = await fetchBggSearch(trimmed, cap);
  const upserted = await upsertBggResults(remoteResults);

  return { results: upserted.slice(0, cap), remoteUsed: true };
}

/**
 * Main game search function with cache-first strategy.
 * 1. Searches Firestore cache first
 * 2. If insufficient results (< 3), calls BGG API
 * 3. Merges and deduplicates results
 * 4. Background-refreshes stale items (> 30 days old)
 */
export async function searchGames(queryText: string, cap = RESULT_CAP) {
  const trimmed = queryText.trim();
  if (!trimmed) return { results: [] as GameRecord[], fromCache: false, remoteUsed: false };

  const normalizedQuery = normalizeName(trimmed);
  let cacheResults: GameRecord[] = [];
  try {
    cacheResults = await searchGamesCache(normalizedQuery, cap);
  } catch (err) {
    cacheResults = [];
  }

  const staleIds = cacheResults
    .filter((g) => g.fetchedAt && Date.now() - new Date(g.fetchedAt).getTime() > STALE_MS)
    .map((g) => g);

  // Kick off background refresh for stale items (best-effort).
  if (staleIds.length) {
    void (async () => {
      try {
        const refreshQueries = Array.from(
          new Set(staleIds.map((g) => g.primaryName).filter(Boolean)),
        );
        for (const name of refreshQueries) {
          const refreshed = await fetchBggSearch(name, cap);
          await upsertBggResults(refreshed);
        }
      } catch (err) {
        /* no-op */
      }
    })();
  }

  // If cache is good enough, return immediately.
  if (cacheResults.length >= MIN_CACHE_RESULTS) {
    return { results: cacheResults.slice(0, cap), fromCache: true, remoteUsed: false };
  }

  // Otherwise, fetch from BGG function and upsert.
  try {
    const remoteResults = await fetchBggSearch(trimmed, cap);
    const upserted = await upsertBggResults(remoteResults);

    // Merge cache + remote, dedupe by bgg id then by name.
    const mergedMap = new Map<string, GameRecord>();
    [...cacheResults, ...upserted].forEach((g) => {
      const key = g.sourceIds?.bgg ?? g.gameId;
      if (!mergedMap.has(key)) mergedMap.set(key, g);
    });

    const merged = Array.from(mergedMap.values()).slice(0, cap);
    return { results: merged, fromCache: cacheResults.length > 0, remoteUsed: true };
  } catch (err) {
    return { results: cacheResults.slice(0, cap), fromCache: cacheResults.length > 0, remoteUsed: false, error: err };
  }
}

export const CACHE_RESULT_THRESHOLD = MIN_CACHE_RESULTS;
export const DEFAULT_RESULT_CAP = RESULT_CAP;
export const STALENESS_MS = STALE_MS;

export { normalizeName as normalizeGameName };

// ============================================================================
// AI Photo Import - Game Matching
// ============================================================================

/**
 * Detection result from Gemini Vision analysis
 */
export interface GameDetection {
  name: string;
  confidence: number;
}

/**
 * Result of matching a detection to a game
 */
export interface MatchedGame {
  detection: GameDetection;
  game: GameRecord;
  matchScore: number; // 0.0 to 1.0, how well the name matches
}

/**
 * Result of the matching process
 */
export interface MatchingResult {
  matched: MatchedGame[];
  unmatched: GameDetection[];
}

/**
 * Calculates string similarity using Levenshtein distance ratio.
 * Returns a value from 0 (completely different) to 1 (identical).
 */
function stringSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Create matrix for Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[s1.length][s2.length];
  const maxLength = Math.max(s1.length, s2.length);

  return 1 - distance / maxLength;
}

/**
 * Calculates a match score between a detected name and a game record.
 * Uses multiple strategies and returns the best score.
 */
function calculateMatchScore(detectedName: string, game: GameRecord): number {
  const normalizedDetected = normalizeName(detectedName);

  // Strategy 1: Exact match with primary name
  const primarySimilarity = stringSimilarity(normalizedDetected, game.normalized);
  if (primarySimilarity === 1) return 1;

  // Strategy 2: Check alternative names
  let bestAltScore = 0;
  if (game.altNames?.length) {
    for (const altName of game.altNames) {
      const altScore = stringSimilarity(normalizedDetected, normalizeName(altName));
      bestAltScore = Math.max(bestAltScore, altScore);
    }
  }

  // Strategy 3: Contains check (for partial matches)
  // e.g., "Catan" should match "CATAN" or "Settlers of Catan"
  const containsScore = game.normalized.includes(normalizedDetected) ||
    normalizedDetected.includes(game.normalized)
    ? 0.85
    : 0;

  // Return the best score from all strategies
  return Math.max(primarySimilarity, bestAltScore, containsScore);
}

/**
 * Delays execution for a specified number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Matches detected game names to actual games in the database.
 *
 * Strategy:
 * 1. For each detection, search the local Firestore cache first
 * 2. If no good match (score < 0.8), search BGG API
 * 3. Rate limit BGG searches to avoid hitting rate limits
 * 4. Return matched games with scores and unmatched detections
 *
 * @param detections - Array of game detections from AI analysis
 * @param onProgress - Optional callback for progress updates
 * @returns Object with matched games and unmatched detections
 */
export async function matchDetectedGames(
  detections: GameDetection[],
  onProgress?: (matched: number, total: number) => void
): Promise<MatchingResult> {
  const matched: MatchedGame[] = [];
  const unmatched: GameDetection[] = [];
  const seenBggIds = new Set<string>(); // Track matched BGG IDs to avoid duplicates

  // No minimum threshold - show all matches regardless of score
  // Users can see the confidence in the UI and decide which to import
  const BGG_RATE_DELAY_MS = 600; // Delay between BGG API calls

  let bggSearchCount = 0;

  for (let i = 0; i < detections.length; i++) {
    const detection = detections[i];
    onProgress?.(i, detections.length);

    try {
      // Step 1: Search local cache first (increased limit for better matching)
      const normalizedQuery = normalizeName(detection.name);
      const cacheResults = await searchGamesCache(normalizedQuery, 20);

      // Find best match from cache (no minimum threshold)
      let bestMatch: { game: GameRecord; score: number } | null = null;

      for (const game of cacheResults) {
        // Skip if we've already matched this game
        if (seenBggIds.has(game.sourceIds.bgg)) continue;

        const score = calculateMatchScore(detection.name, game);
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { game, score };
        }
      }

      // Step 2: If no good cache match, try BGG API
      if (!bestMatch || bestMatch.score < 0.85) {
        // Rate limit BGG searches
        if (bggSearchCount > 0) {
          await delay(BGG_RATE_DELAY_MS);
        }
        bggSearchCount++;

        try {
          // Increased limit for better matching with games that have many versions
          const bggResults = await fetchBggSearch(detection.name, 15);
          const upserted = await upsertBggResults(bggResults);

          // Also try with results that weren't upserted (for guests)
          const allResults = upserted.length > 0 ? upserted : bggResults.map((r) => ({
            ...r,
            gameId: r.sourceIds.bgg, // Use BGG ID as fallback gameId
            normalized: normalizeName(r.primaryName),
          } as GameRecord));

          for (const game of allResults) {
            // Skip if we've already matched this game
            if (seenBggIds.has(game.sourceIds.bgg)) continue;

            const score = calculateMatchScore(detection.name, game);
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { game, score };
            }
          }
        } catch (bggError) {
          console.warn(`BGG search failed for "${detection.name}":`, bggError);
          // Continue with cache results only
        }
      }

      // Step 3: Add to results (include all matches, no threshold filtering)
      if (bestMatch) {
        seenBggIds.add(bestMatch.game.sourceIds.bgg);
        matched.push({
          detection,
          game: bestMatch.game,
          matchScore: bestMatch.score,
        });
      } else {
        unmatched.push(detection);
      }
    } catch (error) {
      console.error(`Error matching "${detection.name}":`, error);
      unmatched.push(detection);
    }
  }

  onProgress?.(detections.length, detections.length);

  // Note: No longer sorting by confidence - preserve spatial order from Gemini
  // Games are returned in reading order (top-left to bottom-right)

  return { matched, unmatched };
}

/**
 * Determines if a game record needs to be refreshed from BGG API.
 * A game is considered stale if:
 * 1. It's older than 30 days, OR
 * 2. It only has CSV data (missing image/thumbnail), OR
 * 3. It's missing key API fields (designers, mechanics, etc.)
 */
export function isGameStale(game: GameRecord): boolean {
  if (!game.fetchedAt) return true;
  
  // Check age
  const age = Date.now() - new Date(game.fetchedAt).getTime();
  if (age > STALE_MS) return true;
  
  // Check if it's CSV-only (missing image/thumbnail)
  if (!game.image && !game.thumbnail) return true;
  
  // Check if it only has CSV sources
  if (game.sources?.length === 1 && game.sources[0] === 'bgg-csv') return true;
  
  return false;
}

/**
 * Refreshes a single game's data from BGG API if it's stale or incomplete.
 * This is called when a user selects a game to ensure they get the most up-to-date information.
 * 
 * The function:
 * 1. Checks if the game needs refreshing (age > 30 days or missing API data)
 * 2. If stale, fetches fresh data from BGG API by BGG ID
 * 3. Merges with existing data and updates Firestore
 * 4. Returns the updated game record
 * 
 * @param bggId - BoardGameGeek ID for the game
 * @returns Updated game record, or null if refresh failed (still usable with stale data)
 */
export async function refreshGameIfStale(bggId: string): Promise<GameRecord | null> {
  try {
    // Fetch current game record from Firestore
    const existing = await findByBggId(bggId);
    if (!existing) return null;
    
    // Check if refresh is needed
    if (!isGameStale(existing)) {
      return existing; // No refresh needed, data is fresh
    }
    
    // Fetch fresh data from BGG API
    const freshData = await fetchBggGameById(bggId);
    if (!freshData) {
      console.warn(`BGG API returned no data for BGG ID ${bggId}, using stale data`);
      return existing; // API failed, return stale data (graceful degradation)
    }
    
    // Merge fresh data with existing record
    const merged = mergeRecord(existing, freshData);
    
    // Only update Firestore if user is authenticated
    if (auth.currentUser) {
      try {
        // Update Firestore with fresh data (exclude gameId as it's the document ID)
        const targetDoc = doc(GAMES_COLLECTION, merged.gameId);
        const { gameId, ...dataToWrite } = merged;
        await setDoc(targetDoc, dataToWrite, { merge: true });
      } catch (writeError: any) {
        // Log write failures at debug level - not critical since we have the data
        console.debug(`Could not update game cache: ${writeError.message}`);
      }
    } else {
      console.debug('Skipping game cache update: user not authenticated (guest mode)');
    }
    
    return merged;
  } catch (error) {
    console.error('Failed to refresh game data:', error);
    return null; // Return null on error, caller will use stale data
  }
}

/** Conversion factor: 1 inch = 25.4 millimeters */
const INCHES_TO_MM = 25.4;

/**
 * Converts box dimensions from inches (BGG API format) to millimeters (storage format).
 * Returns undefined for each dimension that is not provided or is zero.
 */
export function convertBoxDimensionsToMm(game: {
  boxWidthInches?: number;
  boxLengthInches?: number;
  boxDepthInches?: number;
}): {
  boxWidthMm?: number;
  boxHeightMm?: number;
  boxDepthMm?: number;
} {
  return {
    boxWidthMm: game.boxWidthInches ? Math.round(game.boxWidthInches * INCHES_TO_MM) : undefined,
    boxHeightMm: game.boxLengthInches ? Math.round(game.boxLengthInches * INCHES_TO_MM) : undefined,
    boxDepthMm: game.boxDepthInches ? Math.round(game.boxDepthInches * INCHES_TO_MM) : undefined,
  };
}

