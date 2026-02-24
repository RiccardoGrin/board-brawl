export type PlayerId = string;
export type TournamentId = string;
export type GameSessionId = string;
export type TournamentFormat = 'accumulative' | 'bracket';

/**
 * A player in a tournament.
 * Players can be local (name only) or linked to a registered user account.
 */
export interface Player {
  id: PlayerId;
  /** Display name for the player */
  name: string;
  /** Hex color code for player avatar (e.g., "#4F46E5") */
  color?: string;
  /** URL or icon identifier for avatar (reserved for future use) */
  avatar?: string;
  /**
   * Firebase UID of a linked user account.
   * When set, this player is linked to a registered user who can see
   * this tournament in their "Shared with You" section.
   */
  userId?: string;
  /**
   * 6-digit user code for profile URL navigation (e.g., "123456").
   * Captured when a player is linked via #code lookup.
   */
  userCode?: string;
}

export type TournamentState = 'setup' | 'active' | 'finished';

/**
 * A single match in a bracket tournament.
 * Represents one 1v1 match that feeds into the next round.
 */
export interface BracketMatch {
  /** Unique match identifier (format: "r{round}m{matchNumber}") */
  id: string;
  /** Round number (1 = first round, increases toward finals) */
  round: number;
  /** Position within the round (0-indexed) */
  matchNumber: number;
  /** First player ID (null if waiting for previous round winner) */
  player1Id: PlayerId | null;
  /** Second player ID (null if waiting for previous round winner) */
  player2Id: PlayerId | null;
  /** Winner's player ID (undefined if match not yet played) */
  winnerId?: PlayerId;
  /** Whether the match has been completed */
  isComplete: boolean;
  /** ID of the match this winner advances to (undefined for finals) */
  feedsIntoMatchId?: string;
  /** Timestamp when match was completed (ISO string) */
  completedAt?: string;
}

/**
 * Configuration for bracket tournaments.
 * Bracket tournaments are single-elimination with power-of-2 players (4, 8, 16, 32).
 * Players are seeded sequentially based on entry order.
 */
export interface BracketConfig {
  /** The game being played (e.g., "Chess", "Smash Bros") */
  gameTitle: string;
  /** Optional ID/reference to a canonical game record */
  gameId?: string;
  /** External/source identifiers (e.g., BGG) */
  gameSourceIds?: { bgg?: string };
  /** Useful metadata snapshot for the game */
  gameMeta?: GameMeta;
  /** Total number of rounds (log2 of player count) */
  totalRounds: number;
  /** Current active round (for UI tracking) */
  currentRound: number;
  /** Whether any matches have been completed (used for UI warnings) */
  hasStarted: boolean;
  /** Array of all bracket matches */
  bracket: BracketMatch[];
}

/**
 * A tournament containing players and game sessions.
 * Tournaments support multi-user access via memberIds and role-based permissions.
 */
export interface Tournament {
  id: TournamentId;
  /** Tournament display name (max 25 chars) */
  name: string;
  /** Optional description (max 60 chars) */
  description?: string;
  /** Creation date as ISO string */
  date: string;
  /** Lifecycle state: setup → active → finished */
  state: TournamentState;
  /** List of players in this tournament */
  players: Player[];
  /** IDs of game sessions in this tournament */
  gameSessions: GameSessionId[];
  /** Firebase UID of the tournament owner */
  ownerId?: string;
  /** Display name of the owner (for "Hosted by" in shared view) */
  ownerName?: string;
  /** 
   * Firebase UIDs of all users who can access this tournament.
   * Includes owner + all linked players.
   */
  memberIds?: string[];
  /** 
   * Role assignments for each member.
   * - owner: Full control (edit, delete)
   * - editor: Can add games/players (future)
   * - viewer: Read-only access (default for linked players)
   */
  memberRoles?: Record<string, 'owner' | 'editor' | 'viewer'>;
  /** Timestamp when tournament was created */
  createdAt?: string;
  /** Timestamp of last modification */
  updatedAt?: string;
  /** 
   * Tournament format: 'accumulative' (default) or 'bracket'
   * Undefined is treated as 'accumulative' for backward compatibility
   */
  format?: TournamentFormat;
  /** 
   * Bracket configuration (only present when format === 'bracket')
   */
  bracketConfig?: BracketConfig;
}

// --- Game Logic ---

/**
 * Snapshot of game metadata from a canonical source (e.g., BGG).
 * Stored at selection time to avoid repeated lookups and to preserve
 * the state of the game record when the session/tournament was created.
 */
export interface GameMeta {
  /** Minimum number of players supported */
  minPlayers?: number;
  /** Maximum number of players supported */
  maxPlayers?: number;
  /** Minimum playtime in minutes */
  minPlaytime?: number;
  /** Maximum playtime in minutes */
  maxPlaytime?: number;
  /** Typical/average playtime in minutes */
  playingTime?: number;
  /** URL to game thumbnail image */
  thumbnail?: string;
  /** Year the game was published */
  year?: number;
  /** Box width in millimeters (converted from BGG inches) */
  boxWidthMm?: number;
  /** Box height/length in millimeters (converted from BGG inches) */
  boxHeightMm?: number;
  /** Box depth in millimeters (converted from BGG inches) */
  boxDepthMm?: number;
  /** Focal point X coordinate for thumbnail cropping (0-100, default 50) */
  focalPointX?: number;
  /** Focal point Y coordinate for thumbnail cropping (0-100, default 50) */
  focalPointY?: number;
}

export type GameType = 'ffa' | 'team';

/**
 * Game length preset type.
 * 'bracket' is used for bracket tournament matches (winner: 1, loser: 0)
 */
export type GameLength = 'quick' | 'medium' | 'big' | 'bracket';

export interface ScoringRules {
  first: number;
  second: number;
  third: number;
  others: number;
}

export interface GamePreset {
  name: GameLength;
  label: string;
  description: string;
  defaultScoring: ScoringRules;
}

export const GAME_PRESETS: Record<GameLength, GamePreset> = {
  quick: {
    name: 'quick',
    label: 'Quick Game',
    description: '~15–30 min',
    defaultScoring: { first: 3, second: 2, third: 1, others: 0 },
  },
  medium: {
    name: 'medium',
    label: 'Medium Game',
    description: '~30–60 min',
    defaultScoring: { first: 5, second: 3, third: 1, others: 0 },
  },
  big: {
    name: 'big',
    label: 'Big Game',
    description: '~60+ min',
    defaultScoring: { first: 8, second: 5, third: 2, others: 0 },
  },
  bracket: {
    name: 'bracket',
    label: 'Bracket Match',
    description: '1v1 elimination',
    defaultScoring: { first: 1, second: 0, third: 0, others: 0 },
  },
};

/**
 * Legacy participant result format (still used internally for UI compatibility).
 * Maps to the new placements structure when saving.
 */
export interface ParticipantResult {
  playerId: PlayerId;
  teamId?: string; // If null/undefined, it's FFA individual entry
  rank: number; // 1 = 1st place
  points: number;
}

/**
 * Team composition for team-based games.
 */
export interface TeamComposition {
  id: string;
  name: string; // "Team Red", etc.
  color: string;
  memberIds: PlayerId[];
}

/**
 * Session lifecycle status.
 * - 'draft': Session created but not yet completed (e.g., bracket match waiting to be played)
 * - 'complete': Session finished with results recorded
 */
export type GameSessionStatus = 'draft' | 'complete';

/**
 * Participant in a game session with enriched data.
 */
export interface GameSessionParticipant {
  playerId: PlayerId;
  /** Firebase UID if player is linked to a user account */
  userId?: string;
  /** Snapshot of player name at time of session */
  name: string;
  /** Team ID if this is a team game */
  teamId?: string;
}

/**
 * Placement entry for results.
 * Groups players by their rank (supports ties).
 */
export interface GameSessionPlacement {
  rank: number;
  playerIds: PlayerId[];
  points?: number;
}

/**
 * Results structure for game sessions.
 */
export interface GameSessionResults {
  mode: 'freeForAll' | 'teams';
  placements: GameSessionPlacement[];
}

/**
 * Media attachment for a game session (photos).
 * Only available for signed-in users.
 */
export interface GameSessionMedia {
  id: string;
  type: 'image';
  storagePath: string;
  width?: number;
  height?: number;
  createdAt: string;
}

/**
 * A game session representing a single play of a game.
 *
 * Phase 3: Sessions are stored as top-level documents in /gameSessions/{id}
 * and can optionally be linked to a tournament or bracket match.
 *
 * Session Types:
 * - Tournament session: Has tournamentId, part of multi-game tournament scoring
 * - Bracket session: Has bracketMatchId, represents a bracket match
 * - Casual session: No tournamentId or bracketMatchId (future feature)
 */
export interface GameSession {
  id: GameSessionId;
  /** Firebase UID of the session owner */
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  /** When the game was played (replaces datePlayed) */
  playedAt: string;

  // Game info
  gameId?: string;
  gameName: string;
  /** Thumbnail URL extracted from gameMeta for easy access */
  gameThumbnail?: string;
  /** Full game metadata from BGG or other source */
  gameSourceIds?: { bgg?: string };
  gameMeta?: GameMeta;

  // Linking (all optional for casual sessions in future)
  /** Tournament this session belongs to (optional) */
  tournamentId?: TournamentId;
  /** Bracket match this session represents (optional) */
  bracketMatchId?: string;

  // Lifecycle
  status: GameSessionStatus;

  // Scoring
  /** Game length preset used for scoring */
  preset: GameLength;
  /** Snapshot of scoring rules used for this session */
  scoringRules: ScoringRules;

  // Participant tracking for queries/rules
  /** Firebase UIDs of all participants (for Firestore rules) */
  participantUserIds: string[];
  /** Firebase UIDs of winners (for stats) */
  winnerUserIds: string[];

  // Participants with enriched data
  participants: GameSessionParticipant[];

  // Teams (optional, for team games)
  teams?: TeamComposition[];

  // Results
  results: GameSessionResults;

  // Optional enrichment (signed-in users only)
  /** Personal note about this session */
  note?: string;
  /** Photos/media attached to this session */
  media?: GameSessionMedia[];

  // Legacy compatibility: gameType derived from results.mode
  // This helps with backward compatibility during migration
  /** @deprecated Use results.mode instead */
  gameType?: GameType;
  /** @deprecated Use playedAt instead */
  datePlayed?: string;
}
