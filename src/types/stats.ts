/**
 * User Stats Types
 *
 * Precomputed statistics maintained by Cloud Functions for fast dashboard loading.
 * These types mirror the Firestore document structure in /users/{uid}/stats/aggregate
 * and /users/{uid}/gameStats/{gameId}.
 */

/**
 * Aggregate user statistics stored in /users/{uid}/stats/aggregate
 */
export interface UserStats {
  /** Count of completed game sessions where user participated */
  gamesPlayed: number;

  /** Count of completed sessions where user is in winnerUserIds */
  gamesWon: number;

  /** Count of tournaments where user is a member */
  tournamentsPlayed: number;

  /** Count of games in user's "My Library" */
  gamesOwned: number;

  /** Count of owned games with playCount === 0 */
  unplayedGames: number;

  /** Most played game info (optional - may be unset if no games played) */
  mostPlayedGameId?: string;
  mostPlayedGameName?: string;
  mostPlayedGameThumbnail?: string;
  mostPlayedGameCount?: number;

  /** ISO timestamp of last stats update */
  lastUpdated: string;
}

/**
 * Per-game statistics stored in /users/{uid}/gameStats/{gameId}
 */
export interface UserGameStats {
  /** Game identifier (matches document ID) */
  gameId: string;

  /** Game name (cached for display) */
  gameName: string;

  /** Game thumbnail URL (cached for display) */
  gameThumbnail?: string;

  /** Number of times user has played this game */
  playCount: number;

  /** Number of times user has won this game */
  winCount: number;

  /** ISO timestamp of most recent play */
  lastPlayed: string;

  /** ISO timestamp of first play (set on creation) */
  firstPlayed: string;
}

/**
 * Default stats for users who haven't played any games yet
 */
export const DEFAULT_USER_STATS: UserStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  tournamentsPlayed: 0,
  gamesOwned: 0,
  unplayedGames: 0,
  lastUpdated: new Date().toISOString(),
};
