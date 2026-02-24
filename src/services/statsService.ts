/**
 * Stats Service
 *
 * Provides Firestore operations for reading user statistics.
 * Stats are written by Cloud Functions and read-only from the client.
 */

import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { UserStats, UserGameStats } from '../types/stats';
import { DEFAULT_USER_STATS } from '../types/stats';

/**
 * Convert Firestore Timestamp or string to ISO string.
 */
const toIso = (value: unknown): string => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
};

/**
 * Parse Firestore document data into UserStats type.
 */
const parseUserStats = (data: Record<string, unknown> | undefined): UserStats => {
  if (!data) return { ...DEFAULT_USER_STATS, lastUpdated: new Date().toISOString() };

  return {
    gamesPlayed: typeof data.gamesPlayed === 'number' ? data.gamesPlayed : 0,
    gamesWon: typeof data.gamesWon === 'number' ? data.gamesWon : 0,
    tournamentsPlayed: typeof data.tournamentsPlayed === 'number' ? data.tournamentsPlayed : 0,
    gamesOwned: typeof data.gamesOwned === 'number' ? data.gamesOwned : 0,
    unplayedGames: typeof data.unplayedGames === 'number' ? data.unplayedGames : 0,
    mostPlayedGameId: typeof data.mostPlayedGameId === 'string' ? data.mostPlayedGameId : undefined,
    mostPlayedGameName: typeof data.mostPlayedGameName === 'string' ? data.mostPlayedGameName : undefined,
    mostPlayedGameThumbnail: typeof data.mostPlayedGameThumbnail === 'string' ? data.mostPlayedGameThumbnail : undefined,
    mostPlayedGameCount: typeof data.mostPlayedGameCount === 'number' ? data.mostPlayedGameCount : undefined,
    lastUpdated: toIso(data.lastUpdated),
  };
};

/**
 * Parse Firestore document data into UserGameStats type.
 */
const parseUserGameStats = (data: Record<string, unknown>): UserGameStats => {
  return {
    gameId: typeof data.gameId === 'string' ? data.gameId : '',
    gameName: typeof data.gameName === 'string' ? data.gameName : 'Unknown Game',
    gameThumbnail: typeof data.gameThumbnail === 'string' ? data.gameThumbnail : undefined,
    playCount: typeof data.playCount === 'number' ? data.playCount : 0,
    winCount: typeof data.winCount === 'number' ? data.winCount : 0,
    lastPlayed: toIso(data.lastPlayed),
    firstPlayed: toIso(data.firstPlayed),
  };
};

/**
 * Load user stats from Firestore.
 * Returns DEFAULT_USER_STATS if no stats document exists.
 */
export async function loadUserStats(uid: string): Promise<UserStats> {
  try {
    const statsRef = doc(db, 'users', uid, 'stats', 'aggregate');
    const statsDoc = await getDoc(statsRef);

    if (!statsDoc.exists()) {
      return { ...DEFAULT_USER_STATS, lastUpdated: new Date().toISOString() };
    }

    return parseUserStats(statsDoc.data());
  } catch (error) {
    console.error('[statsService] Failed to load user stats:', error);
    return { ...DEFAULT_USER_STATS, lastUpdated: new Date().toISOString() };
  }
}

/**
 * Subscribe to real-time updates for user stats.
 * Returns an unsubscribe function.
 */
export function subscribeToUserStats(
  uid: string,
  callback: (stats: UserStats) => void
): () => void {
  const statsRef = doc(db, 'users', uid, 'stats', 'aggregate');

  const unsubscribe = onSnapshot(
    statsRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback(parseUserStats(snapshot.data()));
      } else {
        callback({ ...DEFAULT_USER_STATS, lastUpdated: new Date().toISOString() });
      }
    },
    (error) => {
      console.error('[statsService] Stats subscription error:', error);
      // Return default stats on error
      callback({ ...DEFAULT_USER_STATS, lastUpdated: new Date().toISOString() });
    }
  );

  return unsubscribe;
}

/**
 * Load stats for a specific game.
 * Returns null if no stats exist for this game.
 */
export async function loadGameStats(uid: string, gameId: string): Promise<UserGameStats | null> {
  try {
    const gameStatsRef = doc(db, 'users', uid, 'gameStats', gameId);
    const gameStatsDoc = await getDoc(gameStatsRef);

    if (!gameStatsDoc.exists()) {
      return null;
    }

    return parseUserGameStats(gameStatsDoc.data());
  } catch (error) {
    console.error('[statsService] Failed to load game stats:', error);
    return null;
  }
}

/**
 * Load top played games for a user.
 * Returns an array of game stats sorted by playCount descending.
 */
export async function loadTopPlayedGames(
  uid: string,
  maxGames: number = 10
): Promise<UserGameStats[]> {
  try {
    const gameStatsRef = collection(db, 'users', uid, 'gameStats');
    const topGamesQuery = query(gameStatsRef, orderBy('playCount', 'desc'), limit(maxGames));
    const snapshot = await getDocs(topGamesQuery);

    return snapshot.docs.map((doc) => parseUserGameStats(doc.data()));
  } catch (error) {
    console.error('[statsService] Failed to load top played games:', error);
    return [];
  }
}
